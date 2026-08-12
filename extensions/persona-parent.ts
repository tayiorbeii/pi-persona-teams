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

let requestSequence = 0;

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
    },
    required: ["action"],
  };
}

function toolsFromPi(pi: any): Array<{ name?: string; description?: string; source?: string; provenance?: string }> {
  return typeof pi.getAllTools === "function" ? pi.getAllTools().map((tool: { name?: string; description?: string; source?: string; provenance?: string }) => ({ name: tool.name, description: tool.description, source: tool.source, provenance: tool.provenance })) : [];
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
  };
  if (!pi.events || typeof pi.events.on !== "function" || typeof pi.events.emit !== "function") {
    throw new Error("Pi extension event bus is unavailable for pi-subagents delegation");
  }

  const requestId = `persona-${Date.now()}-${++requestSequence}`;
  const ownerRunId = `persona-parent-${requestId}`;
  const nodeId = `persona-team:${request.agent}:${requestId}`;
  const delegationRequest = {
    version: 2 as const,
    requestId,
    ownerRunId,
    nodeId,
    agent: request.agent,
    task: request.task,
    context: request.context,
    cwd: workspace,
    artifacts: true,
    result: { kind: "text" as const },
  };

  return await new Promise<DelegationResult>((resolveResult, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = pi.events.on(delegation.SUBAGENT_DELEGATION_RESPONSE_EVENT, (payload: unknown) => {
      const response = payload as {
        version?: number;
        requestId?: string;
        ownerRunId?: string;
        nodeId?: string;
        status?: string;
        error?: string;
        runId?: string;
        launchContractDigest?: string;
        result?: { kind?: string; text?: string; value?: unknown };
      };
      if (response.version !== 2 || response.requestId !== requestId || response.ownerRunId !== ownerRunId || response.nodeId !== nodeId || settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (typeof unsubscribe === "function") unsubscribe();
      if (response.status !== "completed") {
        reject(new Error(`pi-subagents delegation ${response.status ?? "failed"}: ${response.error ?? "no terminal response"}`));
        return;
      }
      if (!response.runId) {
        reject(new Error("pi-subagents delegation completed without a child run ID"));
        return;
      }
      const output = response.result?.kind === "text" ? response.result.text : response.result?.value === undefined ? undefined : JSON.stringify(response.result.value);
      resolveResult({
        output,
        runId: response.runId,
        ordinaryAccepted: true,
        launchContractDigest: response.launchContractDigest ?? launch.contract?.launchContractDigest ?? launch.contract?.digest,
      });
    });
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (typeof unsubscribe === "function") unsubscribe();
      reject(new Error("timed out waiting for pi-subagents delegation response"));
    }, 120_000);
    try {
      pi.events.emit(delegation.SUBAGENT_DELEGATION_REQUEST_EVENT, delegationRequest);
    } catch (error) {
      if (timer) clearTimeout(timer);
      if (typeof unsubscribe === "function") unsubscribe();
      reject(error);
    }
  });
}

export default function personaParentExtension(pi: any): void {
  const root = packageRoot();
  pi.registerTool({
    name: "persona_team",
    label: "Persona Team",
    description: "List, diagnose, or run a canonical pi-persona-teams persona.",
    parameters: toolParameters(),
    async execute(_toolCallId: string, params: { action: "list" | "doctor" | "run"; persona?: string; task?: string }) {
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
        delegate: (request) => delegateThroughPiSubagents(pi, process.cwd(), request),
      }, runtimeName, task);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
}
