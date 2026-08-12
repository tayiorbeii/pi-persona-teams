import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as nodeFs from "node:fs";
import { dirname, join } from "node:path";
import type { PersonaFile } from "./persona-file.ts";
import { sha256 } from "./persona-file.ts";
import { ledgerDeficiencies, methodEntries, type PersonaLedger } from "./ledger.ts";

const fs = nodeFs as Record<string, (...args: any[]) => any>;
let temporarySequence = 0;

export interface PersonaAttestationMethod {
  id: string;
  bodySha256: string;
  activated: boolean;
  plannedApplication?: string;
  disposition?: "applied" | "not_applicable";
  evidence?: unknown[];
  justification?: string;
}

export interface PersonaAttestation {
  schema: "pi.persona-attestation/v1";
  status: "passed" | "failed";
  runtimeName: string;
  role: string;
  runId: string;
  childIndex: number;
  contractDigest: string;
  agentFileDigest: string;
  launchContractDigest?: string;
  methods: PersonaAttestationMethod[];
  providers: PersonaLedger["providers"];
  policy: {
    blockedCalls: number;
    unresolvedViolations: number;
    repairTurns: number;
  };
  issuedAt: string;
  failureReasons?: string[];
}

export interface AttestationExpectation {
  runtimeName: string;
  role?: string;
  runId?: string;
  childIndex?: number;
  contractDigest?: string;
  agentFileDigest?: string;
  launchContractDigest?: string;
  methodHashes?: Record<string, string>;
  notSameAs?: { runtimeName: string; runId: string };
}

export function createAttestation(ledger: PersonaLedger): PersonaAttestation {
  const unresolved = ledger.policyEvents.filter((event) => event.action === "blocked" && (event as { unresolved?: boolean }).unresolved === true).length;
  const failures: string[] = [];
  if (ledger.completionStatus !== "passed") failures.push("ledger completion did not pass");
  if (ledger.completionDeficiencies?.length) failures.push(...ledger.completionDeficiencies);
  else failures.push(...ledgerDeficiencies(ledger));
  if (unresolved) failures.push(`${unresolved} unresolved policy violation(s)`);
  return {
    schema: "pi.persona-attestation/v1",
    status: failures.length === 0 ? "passed" : "failed",
    runtimeName: ledger.runtimeName,
    role: ledger.role,
    runId: ledger.runId,
    childIndex: ledger.childIndex,
    contractDigest: ledger.contractDigest,
    agentFileDigest: ledger.agentFileDigest,
    ...(ledger.launchContractDigest ? { launchContractDigest: ledger.launchContractDigest } : {}),
    methods: methodEntries(ledger).map(({ id, bodySha256, activatedAt, plannedApplication, disposition, evidence, justification }) => ({
      id,
      bodySha256,
      activated: Boolean(activatedAt),
      plannedApplication,
      disposition,
      evidence,
      justification,
    })),
    providers: ledger.providers,
    policy: {
      blockedCalls: ledger.policyEvents.filter((event) => event.action === "blocked").length,
      unresolvedViolations: unresolved,
      repairTurns: ledger.repairTurns,
    },
    issuedAt: new Date().toISOString(),
    ...(failures.length ? { failureReasons: failures } : {}),
  };
}

function assertRegularFinalPath(path: string): void {
  try {
    if (fs.lstatSync(path).isSymbolicLink()) throw new Error(`refusing to replace symbolic link: ${path}`);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
}

function atomicWriteAttestation(path: string, attestation: PersonaAttestation): void {
  assertRegularFinalPath(path);
  const temporary = join(dirname(path), `.${path.split(/[\\/]/).pop()}.${Date.now()}.${temporarySequence++}.${sha256(path).slice(0, 8)}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(attestation, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    assertRegularFinalPath(path);
    fs.renameSync(temporary, path);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") throw error;
    }
  }
}

export function writeAttestation(attestation: PersonaAttestation, directory: string): string {
  mkdirSync(directory, { recursive: true });
  const safeRunId = attestation.runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const runHash = sha256(attestation.runId).slice(0, 16);
  const path = join(directory, `${safeRunId}-${runHash}-${attestation.childIndex}.json`);
  atomicWriteAttestation(path, attestation);
  return path;
}

export function readAttestation(path: string): PersonaAttestation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`persona attestation restore failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const validation = validateAttestationShape(parsed);
  if (validation.length) throw new Error(`persona attestation restore failed: ${validation.join("; ")}`);
  return parsed as PersonaAttestation;
}


const EVIDENCE_KINDS = new Set(["artifact-section", "decision", "tool-result", "test-result", "provider-result"]);
const PROVIDER_AVAILABILITIES = new Set(["available", "unavailable", "failed"]);
const PROVIDER_STATUSES = new Set(["used", "not_applicable", "degraded", "unavailable", "pending"]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateAttestationShape(attestation: unknown): string[] {
  const errors: string[] = [];
  const value = record(attestation);
  if (!value) return ["attestation is not an object"];
  if (value.schema !== "pi.persona-attestation/v1") errors.push("unsupported attestation schema");
  if (value.status !== "passed" && value.status !== "failed") errors.push("attestation status is invalid");
  for (const field of ["runtimeName", "role", "runId", "contractDigest", "agentFileDigest", "issuedAt"] as const) {
    if (!nonEmptyString(value[field])) errors.push(`${field} is missing`);
  }
  if (!Number.isInteger(value.childIndex) || (value.childIndex as number) < 0) errors.push("childIndex is invalid");
  if (value.launchContractDigest !== undefined && !nonEmptyString(value.launchContractDigest)) errors.push("launchContractDigest is invalid");
  if (!Array.isArray(value.methods)) errors.push("methods are missing");
  else {
    const seen = new Set<string>();
    for (const [index, item] of value.methods.entries()) {
      const method = record(item);
      if (!method || !nonEmptyString(method.id) || !nonEmptyString(method.bodySha256) || typeof method.activated !== "boolean") {
        errors.push(`invalid method attestation entry: ${index}`);
        continue;
      }
      if (seen.has(method.id)) errors.push(`duplicate method attestation: ${method.id}`);
      seen.add(method.id);
      if (method.activated && !nonEmptyString(method.plannedApplication)) errors.push(`activated method has no planned application: ${method.id}`);
      if (!method.activated && (method.plannedApplication !== undefined || method.disposition !== undefined || method.evidence !== undefined || method.justification !== undefined)) errors.push(`inactive method has completion data: ${method.id}`);
      if (method.disposition === "applied") {
        if (!Array.isArray(method.evidence) || method.evidence.length === 0) errors.push(`applied method has no evidence: ${method.id}`);
        else for (const [evidenceIndex, evidenceItem] of method.evidence.entries()) {
          const evidence = record(evidenceItem);
          if (!evidence || !EVIDENCE_KINDS.has(evidence.kind as string) || !nonEmptyString(evidence.summary)) errors.push(`invalid method evidence: ${method.id}[${evidenceIndex}]`);
          else if ((evidence.path !== undefined && !nonEmptyString(evidence.path)) || (evidence.locator !== undefined && !nonEmptyString(evidence.locator))) errors.push(`invalid method evidence locator: ${method.id}[${evidenceIndex}]`);
        }
        if (method.justification !== undefined) errors.push(`applied method has not_applicable justification: ${method.id}`);
      } else if (method.disposition === "not_applicable") {
        if (!nonEmptyString(method.justification) || method.justification.trim().length < 12) errors.push(`not_applicable method has no justification: ${method.id}`);
        if (method.evidence !== undefined) errors.push(`not_applicable method has applied evidence: ${method.id}`);
      } else if (method.disposition !== undefined) errors.push(`method has no valid disposition: ${method.id}`);
    }
  }
  const providers = record(value.providers);
  if (!providers) errors.push("provider obligations are missing");
  else for (const name of ["contextMode", "jcodemunch", "native"]) {
    const provider = record(providers[name]);
    if (!provider || !PROVIDER_AVAILABILITIES.has(provider.availability as string) || !PROVIDER_STATUSES.has(provider.status as string) || !Number.isInteger(provider.uses) || (provider.uses as number) < 0 || !Number.isInteger(provider.failures) || (provider.failures as number) < 0 || !Number.isInteger(provider.fallbackUses) || (provider.fallbackUses as number) < 0) errors.push(`invalid provider state: ${name}`);
    else if (provider.reason !== undefined && !nonEmptyString(provider.reason)) errors.push(`invalid provider reason: ${name}`);
  }
  const policy = record(value.policy);
  if (!policy || !Number.isInteger(policy.blockedCalls) || (policy.blockedCalls as number) < 0 || !Number.isInteger(policy.unresolvedViolations) || (policy.unresolvedViolations as number) < 0 || !Number.isInteger(policy.repairTurns) || (policy.repairTurns as number) < 0) errors.push("policy counters are invalid");
  const reasons = value.failureReasons;
  if (value.status === "passed" && reasons !== undefined) errors.push("passed attestation has failure reasons");
  if (value.status === "failed" && (!Array.isArray(reasons) || reasons.length === 0 || reasons.some((reason) => !nonEmptyString(reason)))) errors.push("failed attestation has no valid failure reasons");
  return errors;
}

export function verifyAttestation(attestation: unknown, expected: AttestationExpectation): { valid: boolean; errors: string[] } {
  const errors = validateAttestationShape(attestation);
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) return { valid: false, errors };
  const value = attestation as Partial<PersonaAttestation>;
  if (value.status !== "passed") errors.push("attestation status is not passed");
  if (typeof value.runtimeName !== "string" || value.runtimeName !== expected.runtimeName) errors.push("runtimeName mismatch");
  if (typeof value.runId !== "string" || value.runId.length === 0) errors.push("runId is missing");
  if (!Number.isInteger(value.childIndex) || (value.childIndex as number) < 0) errors.push("childIndex is invalid");
  if (expected.role !== undefined && value.role !== expected.role) errors.push("role mismatch");
  if (expected.runId !== undefined && value.runId !== expected.runId) errors.push("runId mismatch");
  if (expected.childIndex !== undefined && value.childIndex !== expected.childIndex) errors.push("childIndex mismatch");
  if (expected.notSameAs && value.runtimeName === expected.notSameAs.runtimeName && value.runId === expected.notSameAs.runId) errors.push("independent run identity matches the earlier run");
  if (expected.contractDigest !== undefined && value.contractDigest !== expected.contractDigest) errors.push("contractDigest mismatch");
  if (expected.agentFileDigest !== undefined && value.agentFileDigest !== expected.agentFileDigest) errors.push("agentFileDigest mismatch");
  if (expected.launchContractDigest !== undefined && value.launchContractDigest !== expected.launchContractDigest) errors.push("launchContractDigest mismatch");
  const expectedMethods = new Set(Object.keys(expected.methodHashes ?? {}));
  if (!Array.isArray(value.methods)) errors.push("methods are missing");
  else {
    const methods = value.methods as PersonaAttestationMethod[];
    const seen = new Set<string>();
    for (const method of methods) {
      if (!method || typeof method !== "object" || typeof method.id !== "string") {
        errors.push("invalid method attestation entry");
        continue;
      }
      if (seen.has(method.id)) errors.push(`duplicate method attestation: ${method.id}`);
      seen.add(method.id);
      if (expected.methodHashes !== undefined && !expectedMethods.has(method.id)) errors.push(`unexpected method attestation: ${method.id}`);
    }
    for (const [id, hash] of Object.entries(expected.methodHashes ?? {})) {
      const method = methods.find((item) => item.id === id);
      if (!method) errors.push(`missing method attestation: ${id}`);
      else {
        if (method.bodySha256 !== hash) errors.push(`method hash mismatch: ${id}`);
        if (method.activated !== true) errors.push(`method not activated: ${id}`);
        if (method.disposition === "applied" && (!Array.isArray(method.evidence) || method.evidence.length === 0)) errors.push(`applied method has no evidence: ${id}`);
        if (method.disposition === "not_applicable" && (!method.justification || method.justification.trim().length < 12)) errors.push(`not_applicable method has no justification: ${id}`);
        if (method.disposition !== "applied" && method.disposition !== "not_applicable") errors.push(`method has no valid disposition: ${id}`);
      }
    }
    if (expected.methodHashes !== undefined && methods.length !== expectedMethods.size) errors.push("method attestation set is incomplete or contains extras");
  }
  if (!value.providers || typeof value.providers !== "object" || !value.providers.contextMode || !value.providers.jcodemunch) errors.push("provider obligations are missing");
  if (!value.policy || typeof value.policy !== "object" || value.policy.unresolvedViolations !== 0) errors.push("unresolved policy violations");
  else if (!Number.isInteger(value.policy.blockedCalls) || (value.policy.blockedCalls as number) < 0 || !Number.isInteger(value.policy.repairTurns) || (value.policy.repairTurns as number) < 0) errors.push("policy counters are invalid");
  return { valid: errors.length === 0, errors };
}

export function attestationDirectory(workspace: string, configured?: string): string {
  return configured ?? join(workspace, ".pi-persona", "attestations");
}

export function attestationDigest(attestation: PersonaAttestation): string {
  return `sha256:${sha256(JSON.stringify(attestation))}`;
}

export function attestationFromPersona(persona: PersonaFile, ledger: PersonaLedger): PersonaAttestation {
  if (persona.agentFileDigest !== ledger.agentFileDigest) throw new Error("ledger does not belong to selected persona file");
  return createAttestation(ledger);
}
