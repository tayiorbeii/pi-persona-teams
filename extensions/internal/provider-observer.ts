import type { PersonaLedger, ProviderAvailability } from "./ledger.ts";
import { setProvider } from "./ledger.ts";

/**
 * Context providers a persona child observes. Pi Context Capsules is the default
 * context provider; context-mode is no longer a provider (see isContextModeToolName).
 */
export type ProviderName = "capsules" | "jcodemunch";
export const PROVIDER_NAMES = ["capsules", "jcodemunch"] as const satisfies readonly ProviderName[];
export type ProviderUseStatus = "used" | "not_applicable" | "degraded" | "unavailable";

export interface ProviderObservation {
  name: ProviderName;
  availability: ProviderAvailability;
  status: ProviderUseStatus;
  uses: number;
  failures: number;
  fallbackUses: number;
  reason?: string;
}

export interface ProviderToolDescriptor {
  name?: string;
  description?: string;
  source?: string;
  provenance?: string;
}

export interface ProviderProbeInput {
  toolNames?: Iterable<string>;
  tools?: Iterable<ProviderToolDescriptor>;
  environment?: Record<string, string | undefined>;
}

const PROVIDER_TOOL_NAMES: Record<ProviderName, ReadonlySet<string>> = {
  // Pi Context Capsules model tools: read-only recall/analysis over already-captured
  // native read/bash/grep evidence (no shell, writes, or network).
  capsules: new Set(["capsule_recall", "capsule_analyze"]),
  jcodemunch: new Set([
    "jcodemunch_resolve_repo",
    "jcodemunch_get_file_outline",
    "jcodemunch_get_symbol_source",
    "jcodemunch_search_symbols",
    "jcodemunch_search_text",
    "jcodemunch_index_file",
    "jcodemunch_index_repo",
    "jcodemunch_find_importers",
    "jcodemunch_find_references",
    "jcodemunch_get_context_bundle",
    "jcodemunch_plan_turn",
    "jcodemunch_get_blast_radius",
    "jcodemunch_get_ranked_context",
    "jcodemunch_assemble_task_context",
    "jcodemunch_get_changed_symbols",
  ]),
};

const CONTEXT_MODE_OPERATIONS: ReadonlySet<string> = new Set([
  "ctx_execute",
  "ctx_execute_file",
  "ctx_index",
  "ctx_search",
  "ctx_fetch_and_index",
  "ctx_batch_execute",
]);

/**
 * Legacy recognition only. context-mode is disabled for persona children; its tools are
 * recognized so a runtime that still registers them can be reported as a Capsules
 * context-owner conflict (Capsules refuses to run beside any context-mode tool).
 */
export function isContextModeToolName(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  if (CONTEXT_MODE_OPERATIONS.has(normalized) || normalized === "context-mode.search") return true;
  if (/^context[-_]?mode(?:_|$)/.test(normalized)) return true;
  const operation = normalized.match(/^(?:(?:mcp__)?context[-_]?mode(?:__|[:/_]))(ctx_.+)$/)?.[1];
  return Boolean(operation && CONTEXT_MODE_OPERATIONS.has(operation));
}

function providerForToolName(toolName: string): ProviderName | undefined {
  const normalized = toolName.trim().toLowerCase();
  if (PROVIDER_TOOL_NAMES.capsules.has(normalized)) return "capsules";
  if (PROVIDER_TOOL_NAMES.jcodemunch.has(normalized)) return "jcodemunch";

  const codeOperation = normalized.match(/^(?:(?:mcp__)?jcode[-_]?munch(?:__|[:/_]))(?:jcodemunch_)?(.+)$/)?.[1];
  if (codeOperation && PROVIDER_TOOL_NAMES.jcodemunch.has(`jcodemunch_${codeOperation}`)) return "jcodemunch";
  return undefined;
}

const TRUSTED_PROVIDER_PROVENANCE: Record<ProviderName, ReadonlySet<string>> = {
  capsules: new Set(["capsules", "pi-context-capsules", "context-capsules"]),
  jcodemunch: new Set(["jcodemunch", "jcode-munch", "jcode_munch", "mcp:jcodemunch"]),
};

function trustedDescriptorProvider(tool: ProviderToolDescriptor): ProviderName | undefined {
  const provider = providerForToolName(tool.name ?? "");
  if (!provider) return undefined;
  const provenance = [tool.source, tool.provenance]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase());
  return provenance.some((value) => TRUSTED_PROVIDER_PROVENANCE[provider].has(value)) ? provider : undefined;
}

function observedToolNames(input: ProviderProbeInput): string[] {
  const registryNames = [...(input.toolNames ?? [])];
  const trustedDescriptorNames = [...(input.tools ?? [])]
    .filter((tool) => trustedDescriptorProvider(tool) !== undefined)
    .map((tool) => tool.name ?? "");
  return [...registryNames, ...trustedDescriptorNames];
}

export const CAPSULES_CONTEXT_OWNER_CONFLICT = "context-owner-conflict: context-mode tools are registered in the same runtime, so Capsules refuses to run; remove context-mode from this persona runtime";

export function detectProviders(input: ProviderProbeInput = {}): Record<ProviderName, ProviderObservation> {
  const names = observedToolNames(input);
  const env = input.environment ?? (typeof process !== "undefined" ? process.env : {});
  const capsulesAvailable = env.PI_CAPSULES_AVAILABLE === "1" || names.some((name) => providerForToolName(name) === "capsules");
  // Trusted descriptors only ever contribute provider names, so this effectively checks registry names.
  const contextModeConflict = capsulesAvailable && names.some(isContextModeToolName);
  const codeAvailable = env.PI_JCODEMUNCH_AVAILABLE === "1" || names.some((name) => providerForToolName(name) === "jcodemunch");
  return {
    capsules: contextModeConflict
      ? { name: "capsules", availability: "failed", status: "degraded", uses: 0, failures: 0, fallbackUses: 0, reason: CAPSULES_CONTEXT_OWNER_CONFLICT }
      : { name: "capsules", availability: capsulesAvailable ? "available" : "unavailable", status: capsulesAvailable ? "not_applicable" : "unavailable", uses: 0, failures: 0, fallbackUses: 0, reason: capsulesAvailable ? undefined : "provider not installed or not visible in the runtime registry" },
    jcodemunch: { name: "jcodemunch", availability: codeAvailable ? "available" : "unavailable", status: codeAvailable ? "not_applicable" : "unavailable", uses: 0, failures: 0, fallbackUses: 0, reason: codeAvailable ? undefined : "provider not installed or not visible in the runtime registry" },
  };
}

export function observeProviders(ledger: PersonaLedger, observations: Record<ProviderName, ProviderObservation>): void {
  for (const name of PROVIDER_NAMES) {
    const observation = observations[name];
    setProvider(ledger, name, {
      availability: observation.availability,
      status: observation.status,
      uses: observation.uses,
      failures: observation.failures,
      fallbackUses: observation.fallbackUses,
      reason: observation.reason,
    });
  }
}

export class ProviderObserver {
  readonly observations: Record<ProviderName, ProviderObservation>;
  private readonly trustedToolNames = new Set<string>();
  private readonly routing = new Map<string, { redirected: boolean; providerAttempted: boolean; providerFailed: boolean; fallbackGranted: boolean }>();
  private readonly attempts = new Map<string, { provider: ProviderName; routeKey?: string }>();

  constructor(input: ProviderProbeInput = {}) {
    this.observations = detectProviders(input);
    for (const name of observedToolNames(input)) this.trustedToolNames.add(name.trim().toLowerCase());
  }

  refresh(input: ProviderProbeInput = {}): void {
    const detected = detectProviders(input);
    for (const name of observedToolNames(input)) this.trustedToolNames.add(name.trim().toLowerCase());
    for (const name of PROVIDER_NAMES) {
      if (detected[name].availability === "failed" && this.observations[name].availability !== "failed") {
        this.observations[name].availability = "failed";
        this.observations[name].status = "degraded";
        this.observations[name].reason = detected[name].reason;
      } else if (detected[name].availability === "available") {
        this.observations[name].availability = "available";
        if (this.observations[name].status === "unavailable") this.observations[name].status = "not_applicable";
        if (!this.observations[name].reason || this.observations[name].reason.includes("not installed")) this.observations[name].reason = detected[name].reason;
      }
    }
  }

  reprobe(input: ProviderProbeInput | Iterable<string> = {}): void {
    this.refresh(typeof input === "object" && !(Symbol.iterator in input) ? input as ProviderProbeInput : { toolNames: input as Iterable<string> });
  }

  availability(name: ProviderName): ProviderAvailability {
    return this.observations[name].availability;
  }

  markUsed(name: ProviderName, reason?: string): void {
    const item = this.observations[name];
    item.availability = "available";
    item.uses += 1;
    item.status = item.failures > 0 ? "degraded" : "used";
    if (item.failures === 0) item.reason = reason;
  }

  markNotApplicable(name: ProviderName, reason: string): void {
    const item = this.observations[name];
    item.status = "not_applicable";
    item.reason = reason;
  }

  markFailure(name: ProviderName, reason: string): void {
    const item = this.observations[name];
    if (item.uses <= item.failures) item.uses = item.failures + 1;
    item.failures += 1;
    item.availability = "failed";
    item.status = "degraded";
    item.reason = reason;
  }

  private routeKey(name: ProviderName, fingerprint: string): string {
    return `${name}:${fingerprint}`;
  }

  private attemptKey(name: ProviderName, fingerprint: string, correlationId?: string): string {
    return `${name}:${correlationId ?? fingerprint}`;
  }

  private pendingRoute(name: ProviderName): string | undefined {
    return [...this.routing.entries()].reverse().find(([key, state]) =>
      key.startsWith(`${name}:`) && state.redirected && !state.providerAttempted && !state.providerFailed && !state.fallbackGranted
    )?.[0];
  }

  allowFallback(name: ProviderName, fingerprint: string): boolean {
    const key = this.routeKey(name, fingerprint);
    const state = this.routing.get(key);
    if (!state?.redirected || !state.providerAttempted || !state.providerFailed || state.fallbackGranted) return false;
    state.fallbackGranted = true;
    this.observations[name].fallbackUses += 1;
    this.observations[name].status = "degraded";
    return true;
  }

  shouldRedirect(name: ProviderName, fingerprint: string): boolean {
    const key = this.routeKey(name, fingerprint);
    const state = this.routing.get(key);
    if (state) return false;
    this.routing.set(key, { redirected: true, providerAttempted: false, providerFailed: false, fallbackGranted: false });
    return true;
  }

  failed(name: ProviderName, fingerprint: string, reason: string): void {
    const key = this.routeKey(name, fingerprint);
    const state = this.routing.get(key);
    if (!state?.redirected || state.providerFailed || state.fallbackGranted) return;
    state.providerAttempted = true;
    state.providerFailed = true;
    this.markFailure(name, reason);
  }

  providerForTool(toolName: string): ProviderName | undefined {
    const normalized = toolName.trim().toLowerCase();
    const provider = providerForToolName(normalized);
    if (!provider) return undefined;
    const providerEstablished = this.observations[provider].availability !== "unavailable";
    return providerEstablished || this.trustedToolNames.has(normalized) ? provider : undefined;
  }

  observeToolCall(toolName: string, fingerprint: string, correlationId?: string): ProviderName | undefined {
    const provider = this.providerForTool(toolName);
    if (!provider) return undefined;
    const key = this.attemptKey(provider, fingerprint, correlationId);
    if (this.attempts.has(key)) return provider;
    const routeKey = this.pendingRoute(provider);
    if (routeKey) this.routing.get(routeKey)!.providerAttempted = true;
    this.attempts.set(key, { provider, routeKey });
    this.markUsed(provider, "provider tool call observed");
    return provider;
  }

  observeToolResult(toolName: string, fingerprint: string, failed: boolean, reason?: string, correlationId?: string): void {
    const provider = this.providerForTool(toolName);
    if (!provider) return;
    const key = this.attemptKey(provider, fingerprint, correlationId);
    const attempt = this.attempts.get(key);
    if (!attempt) return;
    this.attempts.delete(key);
    if (!failed) return;
    if (attempt.routeKey) {
      const state = this.routing.get(attempt.routeKey);
      if (!state || state.providerFailed || state.fallbackGranted) return;
      state.providerFailed = true;
    }
    this.markFailure(provider, reason ?? "provider tool call failed");
  }

  sync(ledger: PersonaLedger): void {
    observeProviders(ledger, this.observations);
    setProvider(ledger, "native", {
      availability: "available",
      status: ledger.providers.native.uses > 0 ? "used" : "not_applicable",
      uses: ledger.providers.native.uses,
      failures: ledger.providers.native.failures,
      fallbackUses: ledger.providers.native.fallbackUses,
      reason: ledger.providers.native.uses > 0 ? undefined : "no native fallback or native retrieval used",
    });
  }
}

export function providerDoctor(toolNames: Iterable<string> = [], environment?: Record<string, string | undefined>, tools?: Iterable<ProviderToolDescriptor>): Record<ProviderName, ProviderObservation> {
  return detectProviders({ toolNames, environment, tools });
}
