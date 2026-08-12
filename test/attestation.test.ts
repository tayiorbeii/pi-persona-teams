import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createAttestation, verifyAttestation } from "../extensions/internal/attestation.ts";
import { createLedger, activateMethod, recordDisposition, completeLedger } from "../extensions/internal/ledger.ts";
import { validatePersonaFile } from "../extensions/internal/persona-file.ts";

const root = join(import.meta.dir, "..");

test("host-authored attestation binds the selected persona and methods", () => {
  const personaResult = validatePersonaFile(join(root, "agents", "engineering-manager.md"));
  if (!personaResult.persona) throw new Error(personaResult.errors.join("; "));
  const ledger = createLedger(personaResult.persona, { runtimeName: "persona-team.engineering-manager", runId: "run-123", childIndex: 2 });
  for (const method of personaResult.persona.methods) {
    expect(activateMethod(ledger, method.id, `Use ${method.id} for the bounded plan evidence.`).ok).toBe(true);
    expect(recordDisposition(ledger, method.id, "applied", [{ kind: "tool-result", summary: `Repository evidence shaped ${method.id}.` }]).ok).toBe(true);
  }
  expect(completeLedger(ledger, "Produced the plan.").ok).toBe(true);
  const attestation = createAttestation(ledger);
  expect(attestation.schema).toBe("pi.persona-attestation/v1");
  expect(verifyAttestation(attestation, { runtimeName: "persona-team.engineering-manager", runId: "run-123", childIndex: 2, contractDigest: personaResult.persona.contractDigest, agentFileDigest: personaResult.persona.agentFileDigest, methodHashes: Object.fromEntries(personaResult.persona.methods.map((method) => [method.id, method.bodySha256])) }).valid).toBe(true);
  expect(verifyAttestation({ ...attestation, runtimeName: "persona-team.staff-reviewer" }, { runtimeName: "persona-team.engineering-manager" }).valid).toBe(false);
  expect(verifyAttestation(JSON.parse("{}"), { runtimeName: "persona-team.engineering-manager" }).valid).toBe(false);
});

test("parent rejects attestation identity, digest, method-set, and evidence mismatches", () => {
  const personaResult = validatePersonaFile(join(root, "agents", "engineering-manager.md"));
  if (!personaResult.persona) throw new Error(personaResult.errors.join("; "));
  const identity = { runtimeName: "persona-team.engineering-manager", runId: "run-negative", childIndex: 1 };
  const ledger = createLedger(personaResult.persona, identity);
  for (const method of personaResult.persona.methods) {
    expect(activateMethod(ledger, method.id, `Apply ${method.id} to this bounded acceptance task.`).ok).toBe(true);
    expect(recordDisposition(ledger, method.id, "applied", [{ kind: "test-result", summary: `Acceptance evidence covers ${method.id}.` }]).ok).toBe(true);
  }
  expect(completeLedger(ledger, "Acceptance artifact produced.").ok).toBe(true);
  const attestation = createAttestation(ledger);
  const expected = {
    ...identity,
    role: "engineering-manager",
    contractDigest: personaResult.persona.contractDigest,
    agentFileDigest: personaResult.persona.agentFileDigest,
    methodHashes: Object.fromEntries(personaResult.persona.methods.map((method) => [method.id, method.bodySha256])),
  };
  const cases: Array<{ value: unknown; error: string }> = [
    { value: { ...attestation, runId: "other-run" }, error: "runId mismatch" },
    { value: { ...attestation, childIndex: 9 }, error: "childIndex mismatch" },
    { value: { ...attestation, contractDigest: "sha256:wrong" }, error: "contractDigest mismatch" },
    { value: { ...attestation, agentFileDigest: "sha256:wrong" }, error: "agentFileDigest mismatch" },
    { value: { ...attestation, methods: attestation.methods.map((method, index) => index === 0 ? { ...method, bodySha256: "0".repeat(64) } : method) }, error: `method hash mismatch: ${attestation.methods[0].id}` },
    { value: { ...attestation, methods: attestation.methods.slice(1) }, error: `missing method attestation: ${attestation.methods[0].id}` },
    { value: { ...attestation, methods: [...attestation.methods, { ...attestation.methods[0], id: "persona-team-extra-method" }] }, error: "unexpected method attestation: persona-team-extra-method" },
    { value: { ...attestation, methods: attestation.methods.map((method, index) => index === 0 ? { ...method, disposition: undefined, evidence: undefined } : method) }, error: `method has no valid disposition: ${attestation.methods[0].id}` },
  ];
  for (const item of cases) {
    const result = verifyAttestation(item.value, expected);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(item.error);
  }
});
