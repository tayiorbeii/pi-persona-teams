import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PersonaFile } from "./persona-file.ts";
import { sha256 } from "./persona-file.ts";
import { ledgerDeficiencies, methodEntries, type PersonaLedger } from "./ledger.ts";

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

export function writeAttestation(attestation: PersonaAttestation, directory: string): string {
  mkdirSync(directory, { recursive: true });
  const safeRunId = attestation.runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const path = join(directory, `${safeRunId}-${attestation.childIndex}.json`);
  writeFileSync(path, `${JSON.stringify(attestation, null, 2)}\n`, "utf8");
  return path;
}

export function readAttestation(path: string): PersonaAttestation {
  return JSON.parse(readFileSync(path, "utf8")) as PersonaAttestation;
}

export function verifyAttestation(attestation: unknown, expected: AttestationExpectation): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) return { valid: false, errors: ["attestation is not an object"] };
  const value = attestation as Partial<PersonaAttestation>;
  if (value.schema !== "pi.persona-attestation/v1") errors.push("unsupported attestation schema");
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
      if (!expectedMethods.has(method.id)) errors.push(`unexpected method attestation: ${method.id}`);
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
    if (methods.length !== expectedMethods.size) errors.push("method attestation set is incomplete or contains extras");
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
