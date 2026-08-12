import { expect, test } from "bun:test";
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createAttestation, readAttestation, verifyAttestation, writeAttestation } from "../extensions/internal/attestation.ts";
import { activateMethod, completeLedger, createLedger, ledgerPersistencePath, persistLedger, recordDisposition, restoreLedger, restoreLedgerSnapshot, serializeLedger } from "../extensions/internal/ledger.ts";
import { validatePersonaFile } from "../extensions/internal/persona-file.ts";

const root = join(import.meta.dir, "..");
const personaResult = validatePersonaFile(join(root, "agents", "engineering-manager.md"));
if (!personaResult.persona) throw new Error(personaResult.errors.join("; "));
const persona = personaResult.persona;

function identity(runId: string) {
  return { runtimeName: "persona-team.engineering-manager", runId, childIndex: 3, launchContractDigest: "sha256:launch" };
}

function completedLedger(runId: string) {
  const ledger = createLedger(persona, identity(runId));
  for (const method of persona.methods) {
    expect(activateMethod(ledger, method.id, `Apply ${method.id} to adversarial persistence validation.`).ok).toBe(true);
    expect(recordDisposition(ledger, method.id, "applied", [{ kind: "test-result", summary: `Adversarial regression evidence for ${method.id}.` }]).ok).toBe(true);
  }
  expect(completeLedger(ledger, "Adversarial persistence validation completed.").ok).toBe(true);
  return ledger;
}

function expected(runId: string) {
  return {
    ...identity(runId),
    role: persona.contract.role,
    contractDigest: persona.contractDigest,
    agentFileDigest: persona.agentFileDigest,
    methodHashes: Object.fromEntries(persona.methods.map((method) => [method.id, method.bodySha256])),
  };
}

test("restore rejects malformed, forged, and cross-field-inconsistent ledger state", () => {
  const runId = "snapshot-adversarial";
  const ledger = completedLedger(runId);
  expect(() => restoreLedgerSnapshot('{"schema":', persona, identity(runId))).toThrow("malformed JSON");

  const wrongIdentity = JSON.parse(serializeLedger(ledger));
  wrongIdentity.runId = "forged-run";
  expect(() => restoreLedgerSnapshot(wrongIdentity, persona, identity(runId))).toThrow("runId mismatch");

  const emptyEvidence = JSON.parse(serializeLedger(ledger));
  emptyEvidence.methods[persona.methods[0]!.id].evidence = [];
  expect(() => restoreLedgerSnapshot(emptyEvidence, persona, identity(runId))).toThrow("no evidence");

  const dispositionWithoutActivation = JSON.parse(serializeLedger(ledger));
  delete dispositionWithoutActivation.methods[persona.methods[0]!.id].activatedAt;
  expect(() => restoreLedgerSnapshot(dispositionWithoutActivation, persona, identity(runId))).toThrow("inconsistent persisted activation");

  const passedWithoutSummary = JSON.parse(serializeLedger(ledger));
  delete passedWithoutSummary.outputSummary;
  expect(() => restoreLedgerSnapshot(passedWithoutSummary, persona, identity(runId))).toThrow("no output summary");
});

test("authoritative ledger restore fails closed on corrupt or forged files", () => {
  const directory = mkdtempSync(join(tmpdir(), "persona-ledger-adversarial-"));
  const path = join(directory, "ledger.json");
  const runId = "authoritative-restore";
  try {
    writeFileSync(path, '{"schema":', "utf8");
    expect(() => restoreLedger(persona, identity(runId), { path })).toThrow("restore failed");
    writeFileSync(path, JSON.stringify({ ...completedLedger(runId), contractDigest: "sha256:forged" }), "utf8");
    expect(() => restoreLedger(persona, identity(runId), { path })).toThrow("contractDigest mismatch");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("attestation verification rejects forged evidence and inconsistent identity expectations", () => {
  const runId = "forged-attestation";
  const attestation = createAttestation(completedLedger(runId));
  const forgedEvidence = structuredClone(attestation);
  forgedEvidence.methods[0]!.evidence = [{ kind: "test-result", summary: "" }];
  const evidenceResult = verifyAttestation(forgedEvidence, expected(runId));
  expect(evidenceResult.valid).toBe(false);
  expect(evidenceResult.errors.some((error) => error.includes("invalid method evidence"))).toBe(true);

  const conflict = verifyAttestation({ ...attestation, runId: "different-run" }, expected(runId));
  expect(conflict.valid).toBe(false);
  expect(conflict.errors).toContain("runId mismatch");
});

test("attestation read rejects corrupt and truncated JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "persona-attestation-corrupt-"));
  const path = join(directory, "corrupt.json");
  try {
    writeFileSync(path, '{"schema":"pi.persona-attestation/v1"', "utf8");
    expect(() => readAttestation(path)).toThrow("restore failed");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("authoritative writes are atomic, collision-resistant, and reject final-path symlinks", () => {
  const directory = mkdtempSync(join(tmpdir(), "persona-atomic-write-"));
  const ledgerPath = join(directory, "ledger.json");
  const victim = join(directory, "victim.json");
  try {
    const ledger = completedLedger("atomic-ledger");
    expect(ledgerPersistencePath(identity("run/a"), { workspace: directory })).not.toBe(ledgerPersistencePath(identity("run?a"), { workspace: directory }));
    expect(persistLedger(ledger, ledgerPath)).toBe(ledgerPath);
    expect(JSON.parse(readFileSync(ledgerPath, "utf8")).runId).toBe("atomic-ledger");
    expect(readdirSync(directory).filter((name) => name.endsWith(".tmp"))).toEqual([]);

    writeFileSync(victim, "untouched", "utf8");
    rmSync(ledgerPath);
    symlinkSync(victim, ledgerPath);
    expect(lstatSync(ledgerPath).isSymbolicLink()).toBe(true);
    expect(() => persistLedger(ledger, ledgerPath)).toThrow("symbolic link");
    expect(readFileSync(victim, "utf8")).toBe("untouched");

    const first = writeAttestation(createAttestation(completedLedger("run/a")), directory);
    const second = writeAttestation(createAttestation(completedLedger("run?a")), directory);
    expect(basename(first)).not.toBe(basename(second));
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);
    expect(readdirSync(directory).filter((name) => name.endsWith(".tmp"))).toEqual([]);

    rmSync(first);
    symlinkSync(victim, first);
    expect(() => writeAttestation(createAttestation(completedLedger("run/a")), directory)).toThrow("symbolic link");
    expect(readFileSync(victim, "utf8")).toBe("untouched");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
