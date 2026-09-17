import { existsSync } from "node:fs";
import { attestationDirectory, createAttestation, writeAttestation, type PersonaAttestation } from "./internal/attestation.ts";
import { readChildIdentity, personaFileFromIdentity, packageRootFromChildExtension, type ChildIdentity } from "./internal/child-identity.ts";
import { completeLedger, createLedger, activateMethod, ledgerDeficiencies, recordDisposition, recordPolicyEvent, type PersonaEvidence, type PersonaLedger } from "./internal/ledger.ts";
import { parsePersonaFile, validatePersonaFile, type PersonaFile } from "./internal/persona-file.ts";
import { evaluateToolCall, type PolicyDecision } from "./internal/role-policy.ts";
import { ProviderObserver, type ProviderToolDescriptor } from "./internal/provider-observer.ts";

export interface PersonaContractStatus {
  role: string;
  runtimeName: string;
  authority: string;
  requiredMethods: Array<{ id: string; bodySha256: string; activated: boolean; disposition?: string }>;
  providers: PersonaLedger["providers"];
  toolVisibility: { available: string[] };
  deficiencies: string[];
  repairTurns: number;
  completionStatus: PersonaLedger["completionStatus"];
}

export interface PersonaChildAction {
  action: "status" | "activate" | "disposition" | "complete" | "provider";
  method?: string;
  plannedApplication?: string;
  disposition?: "applied" | "not_applicable";
  evidence?: PersonaEvidence[];
  justification?: string;
  outputSummary?: string;
  provider?: "contextMode" | "jcodemunch" | "native";
  availability?: "available" | "unavailable" | "failed";
  status?: "used" | "not_applicable" | "degraded" | "unavailable" | "pending";
  reason?: string;
}

export interface PersonaChildResult {
  ok: boolean;
  message: string;
  status?: PersonaContractStatus;
  deficiencies?: string[];
  attestation?: PersonaAttestation;
  attestationPath?: string;
  blocked?: PolicyDecision;
}

export class PersonaChildRuntime {
  readonly identity: ChildIdentity;
  readonly persona: PersonaFile;
  readonly ledger: PersonaLedger;
  readonly providerObserver: ProviderObserver;
  private latestAttestation?: PersonaAttestation;
  private latestAttestationPath?: string;
  private availableTools: string[];
  private visibilityReported = false;
  private readonly workspace: string;
  private readonly attestationDir: string;
  private readonly verificationPolicy: "advisory" | "strict";

  constructor(options: { identity: ChildIdentity; personaPath: string; workspace?: string; attestationDir?: string; toolNames?: string[]; tools?: ProviderToolDescriptor[]; verificationPolicy?: "advisory" | "strict" }) {
    this.verificationPolicy = options.verificationPolicy ?? "advisory";
    this.identity = options.identity;
    const validation = validatePersonaFile(options.personaPath);
    if (!validation.valid || !validation.persona) throw new Error(`persona admission failed: ${validation.errors.join("; ")}`);
    if (validation.persona.contract.runtimeName !== options.identity.runtimeName) throw new Error("persona contract runtime identity does not match child identity");
    this.persona = validation.persona;
    this.ledger = createLedger(this.persona, options.identity);
    this.providerObserver = new ProviderObserver({ toolNames: options.toolNames ?? [], tools: options.tools ?? [] });
    this.providerObserver.sync(this.ledger);
    this.availableTools = [...new Set([
      ...(options.toolNames ?? []),
      ...(options.tools ?? []).flatMap((tool) => tool.name ? [tool.name] : []),
    ])].sort();
    this.workspace = options.workspace ?? process.cwd();
    this.attestationDir = attestationDirectory(this.workspace, options.attestationDir);
  }

  status(): PersonaContractStatus {
    const requiredMethods = this.persona.contract.requiredMethods.map((id) => {
      const entry = this.ledger.methods[id];
      return { id, bodySha256: entry.bodySha256, activated: Boolean(entry.activatedAt), disposition: entry.disposition };
    });
    const deficiencies = ledgerDeficiencies(this.ledger);
    return { role: this.persona.contract.role, runtimeName: this.persona.contract.runtimeName, authority: this.persona.contract.authority, requiredMethods, providers: this.ledger.providers, toolVisibility: { available: this.availableTools }, deficiencies, repairTurns: this.ledger.repairTurns, completionStatus: this.ledger.completionStatus };
  }

  handle(action: PersonaChildAction): PersonaChildResult {
    if (action.action === "status") {
      this.visibilityReported = true;
      return { ok: true, message: "persona status and actual child tool visibility", status: this.status() };
    }
    if (this.verificationPolicy === "strict" && !this.visibilityReported) return { ok: false, message: "call persona_contract.status first and report its actual child tool visibility", status: this.status() };
    if (action.action === "activate") {
      if (this.ledger.completionStatus === "failed") return { ok: false, message: "persona completion is terminally failed" };
      if (!action.method) return { ok: false, message: "method is required" };
      const result = activateMethod(this.ledger, action.method, action.plannedApplication ?? "");
      return { ok: result.ok, message: result.message, ...(result.ok ? { status: this.status() } : {}) };
    }
    if (action.action === "disposition") {
      if (this.ledger.completionStatus === "failed") return { ok: false, message: "persona completion is terminally failed" };
      if (!action.method || !action.disposition) return { ok: false, message: "method and disposition are required" };
      const result = recordDisposition(this.ledger, action.method, action.disposition, action.evidence, action.justification);
      return { ok: result.ok, message: result.message, ...(result.ok ? { status: this.status() } : {}) };
    }
    if (action.action === "provider") {
      return { ok: false, message: "provider state is host-observed and cannot be self-reported", status: this.status() };
    }
    if (action.action === "complete") {
      const result = completeLedger(this.ledger, action.outputSummary ?? "");
      if (!result.ok) {
        if (this.ledger.completionStatus === "failed") {
          const failure = this.persistFailureAttestation();
          return { ok: false, message: result.message, deficiencies: result.deficiencies, status: this.status(), attestation: failure.attestation, attestationPath: failure.path };
        }
        return { ok: false, message: result.message, deficiencies: result.deficiencies, status: this.status() };
      }
      this.latestAttestation = createAttestation(this.ledger);
      this.latestAttestationPath = writeAttestation(this.latestAttestation, this.attestationDir);
      return { ok: true, message: "persona completion accepted", status: this.status(), attestation: this.latestAttestation, attestationPath: this.latestAttestationPath };
    }
    return { ok: false, message: `unsupported action: ${String(action.action)}` };
  }

  reprobeProviders(toolNames: string[], tools: ProviderToolDescriptor[] = []): void {
    this.providerObserver.reprobe({ toolNames, tools });
    this.providerObserver.sync(this.ledger);
    this.availableTools = [...new Set([
      ...toolNames,
      ...tools.flatMap((tool) => tool.name ? [tool.name] : []),
    ])].sort();
  }

  toolCall(toolName: string, input: Record<string, unknown> = {}, correlationId?: string): PolicyDecision {
    if (this.verificationPolicy === "strict" && !this.visibilityReported) {
      const reason = "call persona_contract.status first and report its actual child tool visibility";
      recordPolicyEvent(this.ledger, { toolName, inputSummary: toolFingerprint(toolName, input).slice(0, 160), action: "blocked", reason });
      return { allowed: false, reason, substantive: true };
    }
    const fingerprint = toolFingerprint(toolName, input);
    let fallbackGranted = false;
    if (isNativeCodeRead(toolName, input) && this.providerObserver.availability("jcodemunch") !== "unavailable") {
      if (this.providerObserver.shouldRedirect("jcodemunch", fingerprint)) {
        const reason = "jCodeMunch is available for this code-orientation operation; use it before broad native exploration";
        recordPolicyEvent(this.ledger, { toolName, inputSummary: fingerprint.slice(0, 160), action: "blocked", reason });
        return { allowed: false, reason, substantive: true };
      }
      fallbackGranted = this.providerObserver.allowFallback("jcodemunch", fingerprint);
      if (!fallbackGranted) {
        const reason = "native code read requires a correlated jCodeMunch failure and its single fallback must remain unused";
        recordPolicyEvent(this.ledger, { toolName, inputSummary: fingerprint.slice(0, 160), action: "blocked", reason });
        return { allowed: false, reason, substantive: true };
      }
    }
    const observedProvider = this.providerObserver.providerForTool(toolName);
    const policyToolName = observedProvider === "contextMode" && toolName.trim().toLowerCase() === "context-mode.search"
      ? "ctx_search"
      : toolName;
    const decision = evaluateToolCall(this.ledger, { toolName: policyToolName, input }, this.workspace, { skipMethodGate: this.verificationPolicy === "advisory" });
    if (decision.allowed) {
      const provider = this.providerObserver.observeToolCall(toolName, fingerprint, correlationId);
      if (!provider && /^(?:read|read_file|grep|find|glob|bash|shell|git_)/i.test(toolName)) {
        this.ledger.providers.native.uses += 1;
        if (fallbackGranted) this.ledger.providers.native.fallbackUses += 1;
      }
      this.providerObserver.sync(this.ledger);
    }
    return decision;
  }

  providerResult(toolName: string, input: Record<string, unknown> = {}, failed: boolean, reason?: string, correlationId?: string): void {
    this.providerObserver.observeToolResult(toolName, toolFingerprint(toolName, input), failed, reason, correlationId);
    this.providerObserver.sync(this.ledger);
  }

  attestation(): PersonaAttestation | undefined {
    return this.latestAttestation;
  }

  persistFailureAttestation(): { attestation: PersonaAttestation; path: string } {
    const attestation = createAttestation(this.ledger);
    const path = writeAttestation(attestation, this.attestationDir);
    return { attestation, path };
  }
}

function toolFingerprint(toolName: string, input: Record<string, unknown>): string {
  return `${toolName}:${JSON.stringify(input, Object.keys(input).sort())}`;
}

function isNativeCodeRead(toolName: string, input: Record<string, unknown>): boolean {
  if (!/^(?:read|read_file|grep|find|glob|search_code)$/i.test(toolName)) return false;
  const path = ["path", "filePath", "filename"].map((key) => input[key]).find((value): value is string => typeof value === "string");
  return Boolean(path && /\.(?:c|cc|cpp|cs|go|java|js|jsx|mjs|py|rb|rs|swift|ts|tsx|vue|svelte)$/i.test(path));
}

export function createPersonaChildRuntimeFromEnvironment(options: { moduleUrl?: string; environment?: Record<string, string | undefined>; workspace?: string; attestationDir?: string; toolNames?: string[]; tools?: ProviderToolDescriptor[]; verificationPolicy?: "advisory" | "strict" } = {}): PersonaChildRuntime {
  const environment = options.environment ?? process.env;
  const identity = readChildIdentity(environment);
  const verificationPolicy = options.verificationPolicy ?? "advisory";
  const packageRoot = packageRootFromChildExtension(options.moduleUrl ?? import.meta.url);
  const personaPath = personaFileFromIdentity(identity, packageRoot);
  if (!existsSync(personaPath)) throw new Error(`canonical persona file does not exist: ${personaPath}`);
  return new PersonaChildRuntime({ identity, personaPath, workspace: options.workspace, attestationDir: options.attestationDir ?? environment.PI_PERSONA_ATTESTATION_DIR, toolNames: options.toolNames, tools: options.tools, verificationPolicy });
}

function toolParameters(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      action: { type: "string", enum: ["status", "activate", "disposition", "complete", "provider"] },
      method: { type: "string" },
      plannedApplication: { type: "string" },
      disposition: { type: "string", enum: ["applied", "not_applicable"] },
      evidence: { type: "array", items: { type: "object" } },
      justification: { type: "string" },
      outputSummary: { type: "string" },
      provider: { type: "string", enum: ["contextMode", "jcodemunch", "native"] },
      availability: { type: "string" },
      status: { type: "string" },
      reason: { type: "string" },
    },
    required: ["action"],
  };
}

export default function personaChildExtension(pi: any): void {
  let runtime: PersonaChildRuntime | undefined;
  let startupError: string | undefined;
  try {
    // Do not call pi.getAllTools() during extension loading: Pi exposes throwing
    // action-method stubs until ExtensionRunner.bindCore() runs. Tool discovery is
    // deferred to the session_start handler below, which fires after binding.
    runtime = createPersonaChildRuntimeFromEnvironment({ tools: [] });
  } catch (error) {
    startupError = error instanceof Error ? error.message : String(error);
  }
  pi.registerTool({
    name: "persona_contract",
    label: "Persona Contract",
    description: "Activate and account for the selected self-contained persona contract.",
    parameters: toolParameters(),
    async execute(_toolCallId: string, params: PersonaChildAction) {
      if (startupError || !runtime) return { content: [{ type: "text", text: `Persona admission failed: ${startupError ?? "unknown startup error"}` }], details: { ok: false, message: startupError ?? "unknown startup error" } };
      // Re-probe the runtime tool registry on demand. MCP direct tools (context-mode,
      // jcodemunch, jdocmunch) are registered asynchronously after session_start, so the
      // initial provider observations can be stale — providers were reported unavailable
      // even though the tools were present in the child. Refreshing here keeps the
      // visibility gate and provider routing truthful without depending on registration
      // timing.
      if (typeof pi.getAllTools === "function") {
        const liveTools: ProviderToolDescriptor[] = pi.getAllTools().map((tool: ProviderToolDescriptor) => ({ name: tool.name, description: tool.description, source: tool.source, provenance: tool.provenance }));
        const liveNames = liveTools.flatMap((tool) => tool.name ? [tool.name] : []);
        runtime.reprobeProviders(liveNames, liveTools);
      }
      const result = runtime.handle(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
  pi.on("session_start", async () => {
    const tools: ProviderToolDescriptor[] = typeof pi.getAllTools === "function"
      ? pi.getAllTools().map((tool: ProviderToolDescriptor) => ({ name: tool.name, description: tool.description, source: tool.source, provenance: tool.provenance }))
      : [];
    const toolNames = tools.flatMap((tool) => tool.name ? [tool.name] : []);
    if (runtime) {
      runtime.reprobeProviders(toolNames, tools);
      return;
    }
    // Retry runtime construction now that the runtime is bound. A load-time failure
    // may have been environmental (e.g., an unset child-identity variable) rather
    // than a genuine persona admission error.
    try {
      runtime = createPersonaChildRuntimeFromEnvironment({ toolNames, tools });
      startupError = undefined;
    } catch (error) {
      startupError = error instanceof Error ? error.message : String(error);
    }
  });
  pi.on("tool_call", async (event: { toolName: string; input?: Record<string, unknown>; toolCallId?: string }) => {
    if (event.toolName === "persona_contract") return undefined;
    if (startupError || !runtime) return { block: true, reason: `Persona admission failed: ${startupError ?? "unknown startup error"}` };
    const decision = runtime.toolCall(event.toolName, event.input ?? {}, event.toolCallId);
    return decision.allowed ? undefined : { block: true, reason: decision.reason };
  });
  pi.on("tool_result", async (event: { toolName?: string; input?: Record<string, unknown>; result?: unknown; isError?: boolean; error?: string; toolCallId?: string }) => {
    if (!runtime || !event.toolName) return undefined;
    const result = event.result as { isError?: boolean; error?: string } | undefined;
    const failed = event.isError === true || Boolean(event.error) || result?.isError === true;
    runtime.providerResult(event.toolName, event.input ?? {}, failed, event.error ?? result?.error, event.toolCallId);
    return undefined;
  });
  pi.on("session_shutdown", async () => {
    if (runtime && !runtime.attestation()) runtime.persistFailureAttestation();
  });
}
