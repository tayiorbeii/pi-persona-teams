import type { PersonaLedger, ProviderAvailability } from "./ledger.ts";
import { setProvider } from "./ledger.ts";

export type ProviderName = "contextMode" | "jcodemunch";
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

function hasTool(toolNames: string[], patterns: RegExp[]): boolean {
  return toolNames.some((name) => patterns.some((pattern) => pattern.test(name)));
}

function providerSearchText(input: ProviderProbeInput): string[] {
  const names = [...(input.toolNames ?? [])];
  const descriptors = [...(input.tools ?? [])];
  return [...names, ...descriptors.flatMap((tool) => [tool.name, tool.description, tool.source, tool.provenance].filter((value): value is string => Boolean(value)))];
}

export function detectProviders(input: ProviderProbeInput = {}): Record<ProviderName, ProviderObservation> {
  const names = providerSearchText(input);
  const env = input.environment ?? (typeof process !== "undefined" ? process.env : {});
  const contextAvailable = env.PI_CONTEXT_MODE_AVAILABLE === "1" || hasTool(names, [/context[-_]?mode/i, /ctx_(?:execute|search|fetch|index)/i, /context provider/i]);
  const codeAvailable = env.PI_JCODEMUNCH_AVAILABLE === "1" || hasTool(names, [/jcode/i, /jcodemunch/i, /code retrieval provider/i]);
  return {
    contextMode: { name: "contextMode", availability: contextAvailable ? "available" : "unavailable", status: contextAvailable ? "not_applicable" : "unavailable", uses: 0, failures: 0, fallbackUses: 0, reason: contextAvailable ? undefined : "provider not installed or not visible in the runtime registry" },
    jcodemunch: { name: "jcodemunch", availability: codeAvailable ? "available" : "unavailable", status: codeAvailable ? "not_applicable" : "unavailable", uses: 0, failures: 0, fallbackUses: 0, reason: codeAvailable ? undefined : "provider not installed or not visible in the runtime registry" },
  };
}

export function observeProviders(ledger: PersonaLedger, observations: Record<ProviderName, ProviderObservation>): void {
  for (const name of ["contextMode", "jcodemunch"] as const) {
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
  private readonly routing = new Map<string, { redirected: boolean; providerFailed: boolean; fallbackGranted: boolean }>();

  constructor(input: ProviderProbeInput = {}) {
    this.observations = detectProviders(input);
  }

  refresh(input: ProviderProbeInput = {}): void {
    const detected = detectProviders(input);
    for (const name of ["contextMode", "jcodemunch"] as const) {
      if (detected[name].availability === "available") {
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
    item.status = "used";
    item.reason = reason;
  }

  markNotApplicable(name: ProviderName, reason: string): void {
    const item = this.observations[name];
    item.status = "not_applicable";
    item.reason = reason;
  }

  markFailure(name: ProviderName, reason: string): void {
    const item = this.observations[name];
    item.failures += 1;
    item.availability = "failed";
    item.status = "degraded";
    item.reason = reason;
  }

  private routeKey(name: ProviderName, fingerprint: string): string {
    return `${name}:${fingerprint}`;
  }

  allowFallback(name: ProviderName, fingerprint: string): boolean {
    const key = this.routeKey(name, fingerprint);
    const state = this.routing.get(key) ?? { redirected: false, providerFailed: false, fallbackGranted: false };
    if (!state.providerFailed || state.fallbackGranted) return false;
    state.fallbackGranted = true;
    this.routing.set(key, state);
    this.observations[name].fallbackUses += 1;
    this.observations[name].status = "degraded";
    return true;
  }

  shouldRedirect(name: ProviderName, fingerprint: string): boolean {
    const key = this.routeKey(name, fingerprint);
    const state = this.routing.get(key) ?? { redirected: false, providerFailed: false, fallbackGranted: false };
    if (state.providerFailed || state.redirected) return false;
    state.redirected = true;
    this.routing.set(key, state);
    return true;
  }

  failed(name: ProviderName, fingerprint: string, reason: string): void {
    const key = this.routeKey(name, fingerprint);
    const state = this.routing.get(key) ?? { redirected: false, providerFailed: false, fallbackGranted: false };
    state.providerFailed = true;
    this.routing.set(key, state);
    this.markFailure(name, reason);
  }

  providerForTool(toolName: string): ProviderName | undefined {
    if (/context[-_]?mode|ctx_(?:execute|search|fetch|index)/i.test(toolName)) return "contextMode";
    if (/jcode|jcodemunch/i.test(toolName)) return "jcodemunch";
    return undefined;
  }

  observeToolResult(toolName: string, fingerprint: string, failed: boolean, reason?: string): void {
    const provider = this.providerForTool(toolName);
    if (!provider) return;
    if (failed) this.failed(provider, fingerprint, reason ?? "provider tool call failed");
    else this.markUsed(provider, "provider tool result observed");
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

export function providerDoctor(toolNames: Iterable<string> = [], environment?: Record<string, string | undefined>, tools?: Iterable<ProviderToolDescriptor>): { contextMode: ProviderObservation; jcodemunch: ProviderObservation } {
  return detectProviders({ toolNames, environment, tools });
}
