import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverThroughPiSubagents,
  listPersonas,
  personaDoctor,
  runPersona,
  type DelegationRequest,
  type DelegationResult,
} from "./internal/persona-facade.ts";
import { waitForDelegationResponse, type DelegationWaitEventNames } from "./internal/delegation-wait.ts";

let requestSequence = 0;

export const PERSONA_DELEGATION_RESPONSE_TIMEOUT_MS = 600_000;
/**
 * Child runs must terminal strictly before the parent gives up, so typed
 * bridge terminals (timed_out/cancelled) arrive instead of the parent's
 * generic timeout racing them. The per-call child bound is
 * waitMs - PERSONA_CHILD_TIMEOUT_MARGIN_MS, clamped to >=1s and <=2^31-1
 * (the bridge validates integer timeoutMs in that range).
 */
export const PERSONA_CHILD_TIMEOUT_MARGIN_MS = 30_000;

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function toolParameters(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list", "doctor", "run"] },
      persona: { type: "string" },
      task: { type: "string" },
      responseTimeoutMs: { type: "number", minimum: 1_000, maximum: 2_147_483_647, description: "Per-call bound for this delegation: the parent wait and the child run deadline (default 600000)." },
    },
    required: ["action"],
  };
}

function toolsFromPi(pi: any): Array<{ name?: string; description?: string; source?: string; provenance?: string }> {
  return typeof pi.getAllTools === "function" ? pi.getAllTools().map((tool: { name?: string; description?: string; source?: string; provenance?: string }) => ({ name: tool.name, description: tool.description, source: tool.source, provenance: tool.provenance })) : [];
}

export interface PersonaDelegationIdentity {
  requestId: string;
  ownerRunId: string;
  nodeId: string;
}

/**
 * Builds the structured delegation request emitted on the pi-subagents request
 * event. The bridge rejects unknown request fields (delegation-request.ts
 * supportedFields), so this wire format must stay exactly within the fields
 * every supported bridge version accepts — notably it must NOT carry a
 * `version` key: bridges do not accept it in requests and do not echo one in
 * responses.
 */
export function buildDelegationRequest(input: PersonaDelegationIdentity & { agent: string; task: string; context: "fresh"; workspace: string; timeoutMs: number }): Record<string, unknown> {
  return {
    requestId: input.requestId,
    ownerRunId: input.ownerRunId,
    nodeId: input.nodeId,
    agent: input.agent,
    task: input.task,
    context: input.context,
    cwd: input.workspace,
    artifacts: true,
    timeoutMs: input.timeoutMs,
    result: { kind: "text" as const },
  };
}

/** Parent wait bound for one delegation: per-call value, else the 600s default, clamped to [1s, 2^31-1]. */
export function resolveWaitMs(responseTimeoutMs?: number): number {
  return Math.max(1_000, Math.min(responseTimeoutMs ?? PERSONA_DELEGATION_RESPONSE_TIMEOUT_MS, 2_147_483_647));
}

/** Child run bound for the same delegation: strictly inside the parent wait so bridge terminals win the race. */
export function resolveChildTimeoutMs(waitMs: number): number {
  return Math.min(Math.max(1_000, waitMs - PERSONA_CHILD_TIMEOUT_MARGIN_MS), 2_147_483_647);
}

async function delegateThroughPiSubagents(pi: any, workspace: string, request: DelegationRequest): Promise<DelegationResult> {
  const preflightName: string = "pi-subagents/preflight";
  const preflight = await import(preflightName) as {
    resolveSubagentLaunchContract?: (input: Record<string, unknown>) => Promise<{
      ok: boolean;
      message?: string;
      contract?: {
        launchContractDigest?: string;
        digest?: string;
        tools?: {
          toolExtensionPaths?: string[];
          runtimeExtensions?: string[];
          configuredExtensions?: string[];
        };
      };
    }>;
  };
  if (!preflight.resolveSubagentLaunchContract) throw new Error("pi-subagents preflight API is unavailable");
  const launch = await preflight.resolveSubagentLaunchContract({
    agent: request.agent,
    task: request.task,
    context: request.context,
    cwd: workspace,
    availableModels: typeof pi.modelRegistry?.getAvailable === "function" ? pi.modelRegistry.getAvailable() : [],
  });
  if (!launch.ok || !launch.contract) throw new Error(launch.message ?? "persona launch preflight failed");
  const expectedLaunchContractDigest = launch.contract.launchContractDigest ?? launch.contract.digest;
  if (!expectedLaunchContractDigest) throw new Error("pi-subagents preflight returned a launch contract without launchContractDigest");
  const extensionPaths = [
    ...(launch.contract.tools?.toolExtensionPaths ?? []),
    ...(launch.contract.tools?.runtimeExtensions ?? []),
    ...(launch.contract.tools?.configuredExtensions ?? []),
  ];
  if (!extensionPaths.some((path) => /persona-child(?:\.ts)?$/.test(path))) {
    throw new Error("persona-child enforcement extension is absent from the resolved launch contract");
  }

  const delegationName: string = "pi-subagents/delegation";
  const delegation = await import(delegationName) as {
    SUBAGENT_DELEGATION_REQUEST_EVENT: string;
    SUBAGENT_DELEGATION_RESPONSE_EVENT: string;
    // Older bridges do not export these constants; every usage degrades
    // gracefully when they are missing.
    SUBAGENT_DELEGATION_STARTED_EVENT?: string;
    SUBAGENT_DELEGATION_UPDATE_EVENT?: string;
    SUBAGENT_DELEGATION_CANCEL_EVENT?: string;
  };
  if (!pi.events || typeof pi.events.on !== "function" || typeof pi.events.emit !== "function") {
    throw new Error("Pi extension event bus is unavailable for pi-subagents delegation");
  }

  const requestId = `persona-${Date.now()}-${++requestSequence}`;
  const ownerRunId = `persona-parent-${requestId}`;
  const nodeId = `persona-team:${request.agent}:${requestId}`;
  const waitMs = resolveWaitMs(request.responseTimeoutMs);
  const delegationRequest = buildDelegationRequest({
    requestId,
    ownerRunId,
    nodeId,
    agent: request.agent,
    task: request.task,
    context: request.context,
    workspace,
    timeoutMs: resolveChildTimeoutMs(waitMs),
  });

  const eventNames: DelegationWaitEventNames = {
    request: delegation.SUBAGENT_DELEGATION_REQUEST_EVENT,
    response: delegation.SUBAGENT_DELEGATION_RESPONSE_EVENT,
    ...(typeof delegation.SUBAGENT_DELEGATION_STARTED_EVENT === "string" ? { started: delegation.SUBAGENT_DELEGATION_STARTED_EVENT } : {}),
    ...(typeof delegation.SUBAGENT_DELEGATION_UPDATE_EVENT === "string" ? { update: delegation.SUBAGENT_DELEGATION_UPDATE_EVENT } : {}),
    ...(typeof delegation.SUBAGENT_DELEGATION_CANCEL_EVENT === "string" ? { cancel: delegation.SUBAGENT_DELEGATION_CANCEL_EVENT } : {}),
  };

  return waitForDelegationResponse({
    bus: pi.events,
    eventNames,
    identity: { requestId, ownerRunId, nodeId },
    delegationRequest,
    expectedLaunchContractDigest,
    waitMs,
    ...(request.onLaunched ? { onLaunched: request.onLaunched } : {}),
  }).then((success) => ({
    output: success.output,
    runId: success.runId,
    ordinaryAccepted: false as const,
    ordinaryAcceptanceReason: "terminal completion is not ordinary acceptance evidence",
    launchContractDigest: success.launchContractDigest,
  }));
}

export default function personaParentExtension(pi: any): void {
  const root = packageRoot();
  pi.registerTool({
    name: "persona_team",
    label: "Persona Team",
    description: "List, diagnose, or run a canonical pi-persona-teams persona.",
    parameters: toolParameters(),
    async execute(_toolCallId: string, params: { action: "list" | "doctor" | "run"; persona?: string; task?: string; responseTimeoutMs?: number }) {
      if (params.action === "list") {
        const result = listPersonas(root);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      }
      if (params.action === "doctor") {
        const tools = toolsFromPi(pi);
        const result = await personaDoctor({
          packageRoot: root,
          workspace: process.cwd(),
          toolNames: tools.map((tool) => tool.name ?? ""),
          toolDescriptors: tools,
          discover: discoverThroughPiSubagents,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      }
      const runtimeName = params.persona?.startsWith("persona-team.") ? params.persona : `persona-team.${params.persona ?? ""}`;
      const task = params.task?.trim();
      if (!task) {
        const result = { accepted: false, errors: ["run requires a bounded task"], runtimeName };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      }
      const result = await runPersona({
        packageRoot: root,
        workspace: process.cwd(),
        ...(params.responseTimeoutMs !== undefined ? { responseTimeoutMs: params.responseTimeoutMs } : {}),
        delegate: (request) => delegateThroughPiSubagents(pi, process.cwd(), request),
      }, runtimeName, task);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
}
