import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSingleFlight,
  discoverThroughPiSubagents,
  listPersonas,
  loadPiSubagentsPreflight,
  personaDoctor,
  runPersona,
  type DelegationRequest,
  type DelegationResult,
} from "./internal/persona-facade.ts";
import { waitForDelegationResponse, type DelegationWaitEventNames, type LaunchedAck } from "./internal/delegation-wait.ts";

let requestSequence = 0;

/**
 * Fallback bound for older bridges that cannot report progress. Current
 * bridges use sliding inactivity instead of a wall-clock deadline.
 */
export const PERSONA_DELEGATION_RESPONSE_TIMEOUT_MS = 600_000;

/**
 * Fast-fail bound for the bridge acceptance ack (the first matching
 * started/update event). A miss means the bridge never accepted the attempt:
 * the wait rejects with status "ack_timeout", the pre-launch attempt is
 * cancelled, and retrying with the same runKey is safe (dedupe entries clear
 * on rejection, so the retry launches a fresh attempt).
 */
export const PERSONA_DELEGATION_ACK_TIMEOUT_MS = 30_000;

/**
 * Sliding no-progress bound: every matching started/update event re-arms it,
 * so a child that keeps reporting progress never trips it. On expiry the
 * child is cancelled and the wait rejects with status "progress_timeout",
 * carrying the last progress snapshot (currentTool, recent-output tail,
 * toolCount, tokens, age). Ignored on bridges without the update event.
 */
export const PERSONA_DELEGATION_PROGRESS_TIMEOUT_MS = 120_000;
/** Older bridges need the child to terminate before the parent's fallback wait. */
export const PERSONA_CHILD_TIMEOUT_MARGIN_MS = 30_000;

/**
 * In-flight delegations keyed by idempotency key. A retry of a run that is
 * still executing attaches to the original attempt (same promise, same
 * LaunchedAck, one child) instead of launching a duplicate child. Entries are
 * removed at terminal, so an intentional re-run after completion starts a
 * fresh child. Deliberately parent-side only: the bridge silently drops
 * requests reusing a settled attempt key, so stable bridge identities across
 * retries would hang instead of deduping.
 */
const pendingDelegations = new Map<string, Promise<DelegationResult>>();
const launchedAcks = new Map<string, LaunchedAck>();

/** Minimal shape of the pi-subagents delegation constants subpath. */
interface PiSubagentsDelegationModule {
  SUBAGENT_DELEGATION_REQUEST_EVENT: string;
  SUBAGENT_DELEGATION_RESPONSE_EVENT: string;
  // Older bridges do not export these constants; every usage degrades
  // gracefully when they are missing.
  SUBAGENT_DELEGATION_STARTED_EVENT?: string;
  SUBAGENT_DELEGATION_UPDATE_EVENT?: string;
  SUBAGENT_DELEGATION_CANCEL_EVENT?: string;
}

// Single-flight (see createSingleFlight in persona-facade.ts): concurrent
// first imports of this subpath race JITI module evaluation and can hand one
// caller a partially initialized namespace.
const loadPiSubagentsDelegation: () => Promise<PiSubagentsDelegationModule> = createSingleFlight(() => {
  const delegationName: string = "pi-subagents/delegation";
  return import(delegationName) as Promise<PiSubagentsDelegationModule>;
});

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
      responseTimeoutMs: { type: "number", minimum: 1_000, maximum: 2_147_483_647, description: "Legacy alias for the sliding inactivity bound (default 120000). On older bridges without updates, this is the fallback total wait bound (default 600000). Prefer progressTimeoutMs." },
      ackTimeoutMs: { type: "number", minimum: 1_000, maximum: 2_147_483_647, description: "Fail fast when the bridge does not acknowledge acceptance within this bound (default 30000). The launch never started, so retrying with the same runKey is safe." },
      progressTimeoutMs: { type: "number", minimum: 1_000, maximum: 2_147_483_647, description: "Cancel the child when no progress update arrives for this long (default 120000); the bound resets on every progress update." },
      runKey: { type: "string", description: "Idempotency key: re-running with the same runKey attaches to the in-flight child instead of launching a duplicate. Default: a digest of persona+task." },
      mode: { type: "string", enum: ["wait", "launch"], description: "launch returns a run handle as soon as the bridge accepts the attempt; wait (default) blocks for terminal completion." },
      workspace: { type: "string", description: "Directory the persona works in and is scoped to (default: the parent's cwd). Point this at the checkout or frozen revision being researched, e.g. a /tmp worktree; the child's cwd, retrieval providers, write boundary, and attestations all follow it." },
      verificationPolicy: { type: "string", enum: ["advisory", "strict"], description: "advisory (default) returns completed output with explicit warnings when nonessential evidence is missing or mismatched; strict fails closed." },
      model: { type: "string", minLength: 1, description: "Model for the persona child as provider/id, optionally with a :thinking suffix (e.g. anthropic/claude-sonnet-5 or openai-codex/gpt-6-luna:high). Default: the persona's configured model, else the parent's current model." },
    },
    required: ["action"],
  };
}

/**
 * Resolves the persona's assigned workspace. The child's repository boundary,
 * context-mode/jCodeMunch project root, and attestation directory all derive
 * from this cwd, so research against another checkout must target it here
 * rather than inherit the parent's cwd.
 */
export function resolvePersonaWorkspace(requested: string | undefined, parentCwd: string = process.cwd()): { ok: true; workspace: string } | { ok: false; error: string } {
  if (requested === undefined || requested.trim() === "") return { ok: true, workspace: parentCwd };
  const workspace = isAbsolute(requested) ? resolve(requested) : resolve(parentCwd, requested);
  try {
    if (!statSync(workspace).isDirectory()) return { ok: false, error: `workspace is not a directory: ${workspace}` };
  } catch {
    return { ok: false, error: `workspace does not exist: ${workspace}` };
  }
  return { ok: true, workspace };
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
export function buildDelegationRequest(input: PersonaDelegationIdentity & { agent: string; task: string; context: "fresh"; workspace: string; timeoutMs: number; model?: string }): Record<string, unknown> {
  return {
    requestId: input.requestId,
    ownerRunId: input.ownerRunId,
    nodeId: input.nodeId,
    agent: input.agent,
    task: input.task,
    context: input.context,
    cwd: input.workspace,
    ...(input.model !== undefined ? { model: input.model } : {}),
    artifacts: true,
    timeoutMs: input.timeoutMs,
    result: { kind: "text" as const },
  };
}

/** Fallback wait on bridges without progress events: per-call value or 600s. */
export function resolveWaitMs(responseTimeoutMs?: number): number {
  return Math.max(1_000, Math.min(responseTimeoutMs ?? PERSONA_DELEGATION_RESPONSE_TIMEOUT_MS, 2_147_483_647));
}

/** Ack fast-fail bound for one delegation: per-call value, else the 30s default, clamped to [1s, 2^31-1]. */
export function resolveAckTimeoutMs(ackTimeoutMs?: number): number {
  return Math.max(1_000, Math.min(ackTimeoutMs ?? PERSONA_DELEGATION_ACK_TIMEOUT_MS, 2_147_483_647));
}

/** Sliding no-progress bound for one delegation: per-call value, else the 120s default, clamped to [1s, 2^31-1]. */
export function resolveProgressTimeoutMs(progressTimeoutMs?: number): number {
  return Math.max(1_000, Math.min(progressTimeoutMs ?? PERSONA_DELEGATION_PROGRESS_TIMEOUT_MS, 2_147_483_647));
}

/** Current bridges use the largest supported runtime bound; older bridges must terminal before the parent fallback. */
export function resolveChildTimeoutMs(waitMs?: number): number {
  return waitMs === undefined ? 2_147_483_647 : Math.min(Math.max(1_000, waitMs - PERSONA_CHILD_TIMEOUT_MARGIN_MS), 2_147_483_647);
}

/** The caller's idempotency key, or a stable digest of agent+task so plain retries dedupe. */
export function idempotencyKeyFor(request: Pick<DelegationRequest, "agent" | "task" | "idempotencyKey">): string {
  if (request.idempotencyKey) return request.idempotencyKey;
  return createHash("sha256").update(`${request.agent}\u0000${request.task}`).digest("hex").slice(0, 24);
}

export interface ParentModel {
  provider: string;
  id: string;
}

/** The parent session's active model, in the shape pi-subagents uses to resolve inherited child models. */
export function parentModelFrom(model: unknown): ParentModel | undefined {
  if (!model || typeof model !== "object") return undefined;
  const { provider, id } = model as { provider?: unknown; id?: unknown };
  return typeof provider === "string" && provider && typeof id === "string" && id ? { provider, id } : undefined;
}

async function startDelegation(pi: any, workspace: string, request: DelegationRequest, key: string, parentModel: ParentModel | undefined): Promise<DelegationResult> {
  const verificationPolicy = request.verificationPolicy ?? "advisory";
  const task = verificationPolicy === "strict"
    ? `${request.task}\n\nStrict verification requested: collect persona_contract.status, activate and disposition each required method, then complete with host-verifiable evidence.`
    : request.task;
  const preflight = await loadPiSubagentsPreflight();
  if (!preflight.resolveSubagentLaunchContract) throw new Error("pi-subagents preflight API is unavailable");
  // The bridge resolves the child's model from the override, the persona's
  // own model, then the parent's active model; preflight must see the same
  // inputs or its launchContractDigest can never match the launched child.
  const launch = (await preflight.resolveSubagentLaunchContract({
    agent: request.agent,
    task,
    context: request.context,
    cwd: workspace,
    ...(request.model !== undefined ? { model: request.model } : {}),
    ...(parentModel ? { parentModel } : {}),
    availableModels: typeof pi.modelRegistry?.getAvailable === "function" ? pi.modelRegistry.getAvailable() : [],
  })) as {
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
  };
  if (!launch.ok || !launch.contract) throw new Error(launch.message ?? "persona launch preflight failed");
  const expectedLaunchContractDigest = launch.contract.launchContractDigest ?? launch.contract.digest;
  if (!expectedLaunchContractDigest && verificationPolicy === "strict") throw new Error("pi-subagents preflight returned a launch contract without launchContractDigest");
  const extensionPaths = [
    ...(launch.contract.tools?.toolExtensionPaths ?? []),
    ...(launch.contract.tools?.runtimeExtensions ?? []),
    ...(launch.contract.tools?.configuredExtensions ?? []),
  ];
  if (!extensionPaths.some((path) => /persona-child(?:\.ts)?$/.test(path))) {
    throw new Error("persona-child enforcement extension is absent from the resolved launch contract");
  }

  const delegation = await loadPiSubagentsDelegation();
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
    task,
    context: request.context,
    workspace,
    ...(request.model !== undefined ? { model: request.model } : {}),
    timeoutMs: resolveChildTimeoutMs(typeof delegation.SUBAGENT_DELEGATION_UPDATE_EVENT === "string" ? undefined : waitMs),
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
    ackTimeoutMs: resolveAckTimeoutMs(request.ackTimeoutMs),
    progressTimeoutMs: resolveProgressTimeoutMs(request.progressTimeoutMs ?? request.responseTimeoutMs),
    verificationPolicy,
    onLaunched: (ack) => {
      launchedAcks.set(key, ack);
      request.onLaunched?.(ack);
    },
  }).then((success) => ({
    output: success.output,
    runId: success.runId,
    ordinaryAccepted: false as const,
    ordinaryAcceptanceReason: "terminal completion is not ordinary acceptance evidence",
    ...(success.launchContractDigest ? { launchContractDigest: success.launchContractDigest } : {}),
    ...(success.warnings ? { warnings: success.warnings } : {}),
    ...(success.executionStatus ? { executionStatus: success.executionStatus } : {}),
  }));
}

/**
 * Delegates a persona run through pi-subagents, deduplicating identical
 * in-flight runs: a retry with the same idempotency key (explicit runKey, or
 * the same agent+task) attaches to the original attempt instead of launching
 * a duplicate child.
 */
export async function delegateThroughPiSubagents(pi: any, workspace: string, request: DelegationRequest, parentModel?: ParentModel): Promise<DelegationResult> {
  // Runs on different models are different children even under one runKey.
  const key = `${request.verificationPolicy ?? "advisory"}:${request.model ?? ""}:${workspace}:${idempotencyKeyFor(request)}`;
  const existing = pendingDelegations.get(key);
  if (existing) {
    const ack = launchedAcks.get(key);
    if (ack && request.onLaunched) {
      try {
        request.onLaunched(ack);
      } catch {
        // Ack consumers must not fail the attach.
      }
    }
    return existing;
  }
  const run = startDelegation(pi, workspace, request, key, parentModel);
  pendingDelegations.set(key, run);
  run.catch(() => {
    // Launch-mode callers may never await this promise; keep the rejection
    // handled so it cannot surface as an unhandled rejection.
  });
  try {
    return await run;
  } finally {
    if (pendingDelegations.get(key) === run) pendingDelegations.delete(key);
    launchedAcks.delete(key);
  }
}

export default function personaParentExtension(pi: any): void {
  const root = packageRoot();
  pi.registerTool({
    name: "persona_team",
    label: "Persona Team",
    description: "List, diagnose, or run a canonical pi-persona-teams persona.",
    parameters: toolParameters(),
    async execute(_toolCallId: string, params: { action: "list" | "doctor" | "run"; persona?: string; task?: string; workspace?: string; responseTimeoutMs?: number; ackTimeoutMs?: number; progressTimeoutMs?: number; runKey?: string; mode?: "wait" | "launch"; verificationPolicy?: "advisory" | "strict"; model?: string }, _signal?: unknown, _onUpdate?: unknown, ctx?: { model?: unknown }) {
      if (params.action === "list") {
        const result = listPersonas(root);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      }
      const resolved = resolvePersonaWorkspace(params.workspace);
      if (!resolved.ok) {
        const result = { accepted: false, errors: [resolved.error] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      }
      const workspace = resolved.workspace;
      if (params.action === "doctor") {
        const tools = toolsFromPi(pi);
        const result = await personaDoctor({
          packageRoot: root,
          workspace,
          toolNames: tools.map((tool) => tool.name ?? ""),
          toolDescriptors: tools,
          discover: discoverThroughPiSubagents,
          attestationDir: process.env.PI_PERSONA_ATTESTATION_DIR ?? join(workspace, ".pi-persona", "attestations"),
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      }
      const runtimeName = params.persona?.startsWith("persona-team.") ? params.persona : `persona-team.${params.persona ?? ""}`;
      const task = params.task?.trim();
      if (!task) {
        const result = { accepted: false, errors: ["run requires a bounded task"], runtimeName };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      }
      const model = params.model?.trim();
      if (params.model !== undefined && !model) {
        const result = { accepted: false, errors: ["model must be a non-empty provider/id"], runtimeName };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      }
      const parentModel = parentModelFrom(ctx?.model);
      // Capture the wall-clock start before entering the delegation seam so a
      // response cannot reuse an attestation persisted by an earlier attempt.
      const attemptStartedAt = Date.now();
      const result = await runPersona({
        packageRoot: root,
        workspace,
        ...(model ? { model } : {}),
        ...(params.responseTimeoutMs !== undefined ? { responseTimeoutMs: params.responseTimeoutMs } : {}),
        ...(params.ackTimeoutMs !== undefined ? { ackTimeoutMs: params.ackTimeoutMs } : {}),
        ...(params.progressTimeoutMs !== undefined ? { progressTimeoutMs: params.progressTimeoutMs } : {}),
        ...(params.runKey !== undefined ? { idempotencyKey: params.runKey } : {}),
        ...(params.mode === "launch" ? { mode: "launch" as const } : {}),
        attestationDir: process.env.PI_PERSONA_ATTESTATION_DIR ?? join(workspace, ".pi-persona", "attestations"),
        attemptStartedAt,
        requireAttemptBinding: process.env.PI_PERSONA_REQUIRE_ATTEMPT_BINDING !== "0",
        verificationPolicy: params.verificationPolicy ?? "advisory",
        delegate: (request) => delegateThroughPiSubagents(pi, workspace, request, parentModel),
      }, runtimeName, task);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
}
