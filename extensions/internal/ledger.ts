import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PersonaFile, Disposition, EmbeddedMethod } from "./persona-file.ts";

export type ProviderAvailability = "available" | "unavailable" | "failed";
export type ProviderStatus = "used" | "not_applicable" | "degraded" | "unavailable" | "pending";

export interface PersonaEvidence {
  kind: "artifact-section" | "decision" | "tool-result" | "test-result" | "provider-result";
  path?: string;
  locator?: string;
  summary: string;
}

export interface ProviderLedger {
  availability: ProviderAvailability;
  status: ProviderStatus;
  uses: number;
  failures: number;
  fallbackUses: number;
  reason?: string;
}

export interface PersonaIdentity {
  runtimeName: string;
  runId: string;
  childIndex: number;
  launchContractDigest?: string;
}

export interface MethodLedgerEntry {
  bodySha256: string;
  activatedAt?: string;
  plannedApplication?: string;
  disposition?: Disposition;
  evidence?: PersonaEvidence[];
  justification?: string;
}

export interface PersonaLedger {
  schema: "pi.persona-ledger/v1";
  runtimeName: string;
  role: string;
  runId: string;
  childIndex: number;
  contractDigest: string;
  agentFileDigest: string;
  launchContractDigest?: string;
  authority: string;
  methods: Record<string, MethodLedgerEntry>;
  providers: {
    contextMode: ProviderLedger;
    jcodemunch: ProviderLedger;
    native: ProviderLedger;
  };
  policyEvents: PolicyEvent[];
  repairTurns: number;
  maxRepairTurns: number;
  completionStatus: "open" | "passed" | "failed";
  completionDeficiencies?: string[];
  outputSummary?: string;
}

export interface PolicyEvent {
  toolName: string;
  inputSummary?: string;
  action: "blocked" | "allowed";
  reason: string;
  unresolved?: boolean;
  at: string;
}

export interface LedgerActionResult {
  ok: boolean;
  message: string;
  deficiencies?: string[];
}

export interface LedgerPersistenceOptions {
  workspace?: string;
  path?: string;
}

const ledgerPaths = new WeakMap<PersonaLedger, string>();

function safeLedgerToken(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function ledgerPersistencePath(identity: PersonaIdentity, options: LedgerPersistenceOptions = {}): string {
  if (options.path) return options.path;
  const directory = process.env.PI_PERSONA_LEDGER_DIR ?? join(options.workspace ?? process.cwd(), ".pi-persona", "ledgers");
  return join(directory, `${safeLedgerToken(identity.runId)}-${identity.childIndex}.json`);
}

function persistBoundLedger(ledger: PersonaLedger): void {
  const path = ledgerPaths.get(ledger);
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function validPersistedLedger(value: unknown, persona: PersonaFile, identity: PersonaIdentity): value is PersonaLedger {
  if (!value || typeof value !== "object") return false;
  const ledger = value as Partial<PersonaLedger>;
  if (ledger.schema !== "pi.persona-ledger/v1" || ledger.runtimeName !== identity.runtimeName || ledger.runId !== identity.runId || ledger.childIndex !== identity.childIndex) return false;
  if (ledger.role !== persona.contract.role || ledger.contractDigest !== persona.contractDigest || ledger.agentFileDigest !== persona.agentFileDigest) return false;
  const expectedLaunchDigest = identity.launchContractDigest ?? process.env.PI_SUBAGENT_LAUNCH_CONTRACT_DIGEST;
  if (expectedLaunchDigest !== undefined && ledger.launchContractDigest !== expectedLaunchDigest) return false;
  if (!ledger.methods || typeof ledger.methods !== "object" || !ledger.providers || typeof ledger.providers !== "object" || !Array.isArray(ledger.policyEvents)) return false;
  if (!Number.isInteger(ledger.repairTurns) || !Number.isInteger(ledger.maxRepairTurns) || !["open", "passed", "failed"].includes(ledger.completionStatus ?? "")) return false;
  const requiredIds = new Set(persona.methods.map((method) => method.id));
  for (const method of persona.methods) {
    const entry = ledger.methods[method.id];
    if (!entry || entry.bodySha256 !== method.bodySha256) return false;
  }
  if (Object.keys(ledger.methods).some((id) => !requiredIds.has(id))) return false;
  return true;
}

export function persistLedger(ledger: PersonaLedger, path = ledgerPaths.get(ledger)): string | undefined {
  if (!path) return undefined;
  ledgerPaths.set(ledger, path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return path;
}

export function restoreLedger(persona: PersonaFile, identity: PersonaIdentity, options: LedgerPersistenceOptions = {}): PersonaLedger | undefined {
  const path = ledgerPersistencePath(identity, options);
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try {
    const raw = readFileSync(path, "utf8");
    parsed = JSON.parse(raw.replace(/\\n\s*$/, ""));
  } catch (error) {
    throw new Error(`persona ledger restore failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!validPersistedLedger(parsed, persona, identity)) throw new Error("persona ledger restore failed: persisted identity, contract, or method hashes do not match");
  const ledger = parsed as PersonaLedger;
  ledger.maxRepairTurns = persona.contract.completion.maxRepairTurns;
  ledgerPaths.set(ledger, path);
  return ledger;
}

const GENERIC_APPLICATIONS = new Set([
  "apply the method",
  "use this method",
  "follow the method",
  "do the method",
  "apply it",
  "n/a",
  "not applicable",
]);

const GENERIC_JUSTIFICATIONS = new Set(["not applicable", "n/a", "not relevant", "irrelevant"]);

function now(): string {
  return new Date().toISOString();
}

function providerDefault(): ProviderLedger {
  return { availability: "unavailable", status: "unavailable", uses: 0, failures: 0, fallbackUses: 0 };
}

export function createLedger(persona: PersonaFile, identity: PersonaIdentity, options: LedgerPersistenceOptions = {}): PersonaLedger {
  const persistenceEnabled = Boolean(options.path || process.env.PI_PERSONA_LEDGER_DIR || process.env.PI_PERSONA_LEDGER_PERSIST === "1" || process.env.PI_SUBAGENT_RUN_ID === identity.runId);
  const restored = persistenceEnabled ? restoreLedger(persona, identity, options) : undefined;
  if (restored) return restored;
  const methods: Record<string, MethodLedgerEntry> = {};
  for (const method of persona.methods) methods[method.id] = { bodySha256: method.bodySha256 };
  const ledger: PersonaLedger = {
    schema: "pi.persona-ledger/v1",
    runtimeName: identity.runtimeName,
    role: persona.contract.role,
    runId: identity.runId,
    childIndex: identity.childIndex,
    contractDigest: persona.contractDigest,
    agentFileDigest: persona.agentFileDigest,
    launchContractDigest: identity.launchContractDigest ?? process.env.PI_SUBAGENT_LAUNCH_CONTRACT_DIGEST,
    authority: persona.contract.authority,
    methods,
    providers: { contextMode: providerDefault(), jcodemunch: providerDefault(), native: providerDefault() },
    policyEvents: [],
    repairTurns: 0,
    maxRepairTurns: persona.contract.completion.maxRepairTurns,
    completionStatus: "open",
  };
  if (persistenceEnabled) {
    ledgerPaths.set(ledger, ledgerPersistencePath(identity, options));
    persistLedger(ledger);
  }
  return ledger;
}

export function missingActivations(ledger: PersonaLedger): string[] {
  return Object.entries(ledger.methods).filter(([, entry]) => !entry.activatedAt).map(([id]) => id);
}

export function missingDispositions(ledger: PersonaLedger): string[] {
  return Object.entries(ledger.methods).filter(([, entry]) => !entry.disposition).map(([id]) => id);
}

export function activateMethod(ledger: PersonaLedger, method: string, plannedApplication: string): LedgerActionResult {
  const entry = ledger.methods[method];
  if (!entry) return { ok: false, message: `unknown required method: ${method}` };
  if (entry.activatedAt) return { ok: true, message: `method already active: ${method}` };
  const plan = plannedApplication.trim().replace(/\s+/g, " ");
  if (plan.length < 12 || GENERIC_APPLICATIONS.has(plan.toLowerCase())) {
    return { ok: false, message: `plannedApplication must describe this task and how ${method} will shape it` };
  }
  entry.activatedAt = now();
  entry.plannedApplication = plan;
  persistBoundLedger(ledger);
  return { ok: true, message: `activated ${method}; body hash ${entry.bodySha256}` };
}

export function recordDisposition(
  ledger: PersonaLedger,
  method: string,
  disposition: Disposition,
  evidence: PersonaEvidence[] = [],
  justification?: string,
): LedgerActionResult {
  const entry = ledger.methods[method];
  if (!entry) return { ok: false, message: `unknown required method: ${method}` };
  if (!entry.activatedAt) return { ok: false, message: `method must be activated first: ${method}` };
  if (entry.disposition) return { ok: false, message: `method already has a terminal disposition: ${method}` };
  if (disposition === "applied") {
    if (!Array.isArray(evidence) || evidence.length === 0) return { ok: false, message: `applied requires concrete evidence: ${method}` };
    if (evidence.some((item) => !item || typeof item.summary !== "string" || item.summary.trim().length < 8 || !item.kind)) {
      return { ok: false, message: `each applied evidence item needs a kind and specific summary: ${method}` };
    }
    entry.evidence = evidence;
  } else if (disposition === "not_applicable") {
    const reason = justification?.trim().replace(/\s+/g, " ") ?? "";
    if (reason.length < 12 || GENERIC_JUSTIFICATIONS.has(reason.toLowerCase())) return { ok: false, message: `not_applicable requires a task-specific justification: ${method}` };
    entry.justification = reason;
  } else {
    return { ok: false, message: `unsupported disposition: ${String(disposition)}` };
  }
  entry.disposition = disposition;
  persistBoundLedger(ledger);
  return { ok: true, message: `recorded ${disposition} for ${method}` };
}

export function setProvider(
  ledger: PersonaLedger,
  provider: "contextMode" | "jcodemunch" | "native",
  update: Partial<ProviderLedger> & { reason?: string },
): void {
  ledger.providers[provider] = { ...ledger.providers[provider], ...update };
  persistBoundLedger(ledger);
}

export function recordPolicyEvent(ledger: PersonaLedger, event: Omit<PolicyEvent, "at">): void {
  ledger.policyEvents.push({ ...event, at: now() });
  persistBoundLedger(ledger);
}

export function ledgerDeficiencies(ledger: PersonaLedger, outputSummary?: string): string[] {
  const deficiencies: string[] = [];
  const activations = missingActivations(ledger);
  const dispositions = missingDispositions(ledger);
  if (activations.length) deficiencies.push(`activate required methods: ${activations.join(", ")}`);
  if (dispositions.length) deficiencies.push(`record dispositions: ${dispositions.join(", ")}`);
  for (const [name, provider] of Object.entries(ledger.providers)) {
    if (name === "native") continue;
    if (provider.availability === "available" && (provider.status === "pending" || (provider.status === "not_applicable" && !provider.reason?.trim()))) {
      deficiencies.push(`${name} availability is unaccounted for; record use or a specific non-use reason`);
    }
  }
  if (ledger.policyEvents.some((event) => event.action === "blocked" && event.unresolved === true)) deficiencies.push("resolve or explicitly carry blocked policy events");
  if (outputSummary !== undefined && !outputSummary.trim()) deficiencies.push("outputSummary is required");
  return deficiencies;
}

export function completeLedger(ledger: PersonaLedger, outputSummary: string): LedgerActionResult {
  if (ledger.completionStatus === "failed") return { ok: false, message: "completion is terminally failed", deficiencies: ["repair budget exhausted"] };
  const deficiencies = ledgerDeficiencies(ledger, outputSummary);
  if (deficiencies.length) {
    ledger.completionDeficiencies = [...deficiencies];
    if (ledger.repairTurns >= ledger.maxRepairTurns) {
      ledger.completionStatus = "failed";
      persistBoundLedger(ledger);
      return { ok: false, message: "completion terminally failed after bounded repair turns", deficiencies };
    }
    ledger.repairTurns += 1;
    persistBoundLedger(ledger);
    return { ok: false, message: `completion requires corrective continuation ${ledger.repairTurns}/${ledger.maxRepairTurns}`, deficiencies };
  }
  ledger.completionDeficiencies = undefined;
  ledger.outputSummary = outputSummary.trim();
  ledger.completionStatus = "passed";
  persistBoundLedger(ledger);
  return { ok: true, message: "persona ledger complete" };
}

export function methodEntries(ledger: PersonaLedger): Array<{ id: string } & MethodLedgerEntry> {
  return Object.entries(ledger.methods).map(([id, entry]) => ({ id, ...entry }));
}

export function methodHashMap(ledger: PersonaLedger): Record<string, string> {
  return Object.fromEntries(Object.entries(ledger.methods).map(([id, entry]) => [id, entry.bodySha256]));
}

export function methodById(persona: PersonaFile, id: string): EmbeddedMethod | undefined {
  return persona.methods.find((method) => method.id === id);
}

function persistedRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

const EVIDENCE_KINDS = new Set<PersonaEvidence["kind"]>(["artifact-section", "decision", "tool-result", "test-result", "provider-result"]);
const PROVIDER_AVAILABILITIES = new Set<ProviderAvailability>(["available", "unavailable", "failed"]);
const PROVIDER_STATUSES = new Set<ProviderStatus>(["used", "not_applicable", "degraded", "unavailable", "pending"]);

function persistedInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`invalid persisted ledger ${field}`);
  return value as number;
}

function persistedEvidence(value: unknown, method: string): PersonaEvidence[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`invalid persisted evidence: ${method}`);
  return value.map((item, index) => {
    const entry = persistedRecord(item);
    if (!entry || typeof entry.kind !== "string" || !EVIDENCE_KINDS.has(entry.kind as PersonaEvidence["kind"]) || typeof entry.summary !== "string" || entry.summary.trim().length < 1) {
      throw new Error(`invalid persisted evidence item ${method}[${index}]`);
    }
    const evidence: PersonaEvidence = { kind: entry.kind as PersonaEvidence["kind"], summary: entry.summary };
    if (entry.path !== undefined) {
      if (typeof entry.path !== "string") throw new Error(`invalid persisted evidence path: ${method}[${index}]`);
      evidence.path = entry.path;
    }
    if (entry.locator !== undefined) {
      if (typeof entry.locator !== "string") throw new Error(`invalid persisted evidence locator: ${method}[${index}]`);
      evidence.locator = entry.locator;
    }
    return evidence;
  });
}

/** Serialize only JSON-safe ledger state for a retry/compaction boundary. */
export function serializeLedger(ledger: PersonaLedger): string {
  try {
    const serialized = JSON.stringify(ledger);
    if (!serialized) throw new Error("empty serialization");
    return serialized;
  } catch (error) {
    throw new Error(`could not serialize persona ledger: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Restore a ledger only when its identity, persona, and state shape still match. */
export function restoreLedgerSnapshot(snapshot: string | unknown, persona: PersonaFile, identity: PersonaIdentity): PersonaLedger {
  let value: unknown;
  try {
    value = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
  } catch {
    throw new Error("invalid persisted persona ledger: malformed JSON");
  }
  const state = persistedRecord(value);
  if (!state || state.schema !== "pi.persona-ledger/v1") throw new Error("invalid persisted persona ledger schema");

  const expected = createLedger(persona, identity);
  for (const [field, expectedValue] of Object.entries({
    runtimeName: expected.runtimeName,
    role: expected.role,
    runId: expected.runId,
    childIndex: expected.childIndex,
    contractDigest: expected.contractDigest,
    agentFileDigest: expected.agentFileDigest,
    authority: expected.authority,
    maxRepairTurns: expected.maxRepairTurns,
  })) {
    if (state[field] !== expectedValue) throw new Error(`persisted ledger ${field} mismatch`);
  }

  const methodsState = persistedRecord(state.methods);
  if (!methodsState) throw new Error("invalid persisted ledger methods");
  const methodIds = persona.methods.map((method) => method.id);
  if (Object.keys(methodsState).length !== methodIds.length || Object.keys(methodsState).some((id) => !methodIds.includes(id))) {
    throw new Error("persisted ledger method set mismatch");
  }
  const methods: Record<string, MethodLedgerEntry> = {};
  for (const method of persona.methods) {
    const entry = persistedRecord(methodsState[method.id]);
    if (!entry || entry.bodySha256 !== method.bodySha256) throw new Error(`persisted ledger method hash mismatch: ${method.id}`);
    const restored: MethodLedgerEntry = { bodySha256: method.bodySha256 };
    if (entry.activatedAt !== undefined) {
      if (typeof entry.activatedAt !== "string" || !entry.activatedAt.trim()) throw new Error(`invalid persisted activation: ${method.id}`);
      restored.activatedAt = entry.activatedAt;
    }
    if (entry.plannedApplication !== undefined) {
      if (typeof entry.plannedApplication !== "string" || !entry.plannedApplication.trim()) throw new Error(`invalid persisted planned application: ${method.id}`);
      restored.plannedApplication = entry.plannedApplication;
    }
    if (entry.disposition !== undefined) {
      if (entry.disposition !== "applied" && entry.disposition !== "not_applicable") throw new Error(`invalid persisted disposition: ${method.id}`);
      restored.disposition = entry.disposition;
    }
    const evidence = persistedEvidence(entry.evidence, method.id);
    if (evidence !== undefined) restored.evidence = evidence;
    if (entry.justification !== undefined) {
      if (typeof entry.justification !== "string" || !entry.justification.trim()) throw new Error(`invalid persisted justification: ${method.id}`);
      restored.justification = entry.justification;
    }
    methods[method.id] = restored;
  }

  const providersState = persistedRecord(state.providers);
  if (!providersState) throw new Error("invalid persisted ledger providers");
  const providers = {} as PersonaLedger["providers"];
  for (const name of ["contextMode", "jcodemunch", "native"] as const) {
    const provider = persistedRecord(providersState[name]);
    if (!provider || typeof provider.availability !== "string" || !PROVIDER_AVAILABILITIES.has(provider.availability as ProviderAvailability) || typeof provider.status !== "string" || !PROVIDER_STATUSES.has(provider.status as ProviderStatus)) {
      throw new Error(`invalid persisted provider state: ${name}`);
    }
    const restored: ProviderLedger = {
      availability: provider.availability as ProviderAvailability,
      status: provider.status as ProviderStatus,
      uses: persistedInteger(provider.uses, `${name}.uses`),
      failures: persistedInteger(provider.failures, `${name}.failures`),
      fallbackUses: persistedInteger(provider.fallbackUses, `${name}.fallbackUses`),
    };
    if (provider.reason !== undefined) {
      if (typeof provider.reason !== "string") throw new Error(`invalid persisted provider reason: ${name}`);
      restored.reason = provider.reason;
    }
    providers[name] = restored;
  }

  if (!Array.isArray(state.policyEvents)) throw new Error("invalid persisted ledger policy events");
  const policyEvents = state.policyEvents.map((item, index) => {
    const event = persistedRecord(item);
    if (!event || typeof event.toolName !== "string" || typeof event.action !== "string" || (event.action !== "blocked" && event.action !== "allowed") || typeof event.reason !== "string" || typeof event.at !== "string") {
      throw new Error(`invalid persisted policy event: ${index}`);
    }
    const restored: PolicyEvent = { toolName: event.toolName, action: event.action, reason: event.reason, at: event.at };
    if (event.inputSummary !== undefined) {
      if (typeof event.inputSummary !== "string") throw new Error(`invalid persisted policy input: ${index}`);
      restored.inputSummary = event.inputSummary;
    }
    if (event.unresolved !== undefined) {
      if (typeof event.unresolved !== "boolean") throw new Error(`invalid persisted policy unresolved flag: ${index}`);
      restored.unresolved = event.unresolved;
    }
    return restored;
  });

  const completionStatus = state.completionStatus;
  if (completionStatus !== "open" && completionStatus !== "passed" && completionStatus !== "failed") throw new Error("invalid persisted completion status");
  const repairTurns = persistedInteger(state.repairTurns, "repairTurns");
  const completionDeficiencies = state.completionDeficiencies;
  if (completionDeficiencies !== undefined && (!Array.isArray(completionDeficiencies) || completionDeficiencies.some((item) => typeof item !== "string"))) throw new Error("invalid persisted completion deficiencies");
  if (state.outputSummary !== undefined && typeof state.outputSummary !== "string") throw new Error("invalid persisted output summary");

  return {
    ...expected,
    methods,
    providers,
    policyEvents,
    repairTurns,
    completionStatus,
    ...(completionDeficiencies !== undefined ? { completionDeficiencies: [...completionDeficiencies] } : {}),
    ...(state.outputSummary !== undefined ? { outputSummary: state.outputSummary } : {}),
  };
}
