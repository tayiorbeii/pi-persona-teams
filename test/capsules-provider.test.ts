import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { createAttestation, readAttestation, verifyAttestation, writeAttestation } from "../extensions/internal/attestation.ts";
import { activateMethod, completeLedger, createLedger, ledgerDeficiencies, recordDisposition, restoreLedgerSnapshot, serializeLedger } from "../extensions/internal/ledger.ts";
import { parsePersonaFile, validatePersonaFile } from "../extensions/internal/persona-file.ts";
import { CapsulesProvider } from "../extensions/internal/providers/capsules.ts";

const root = join(import.meta.dir, "..");
const agentsDir = join(root, "agents");
const roles = readdirSync(agentsDir).filter((file) => file.endsWith(".md")).map((file) => file.slice(0, -3)).sort();
const emPath = join(agentsDir, "engineering-manager.md");
const persona = validatePersonaFile(emPath).persona!;
let runSequence = 0;

function identity(runId: string) {
  return { runtimeName: "persona-team.engineering-manager", runId, childIndex: 0 };
}

function completedLedger(runId: string) {
  const ledger = createLedger(persona, identity(runId));
  for (const method of persona.methods) {
    expect(activateMethod(ledger, method.id, `Apply ${method.id} to the Capsules back-compat check.`).ok).toBe(true);
    expect(recordDisposition(ledger, method.id, "applied", [{ kind: "test-result", summary: `Capsules back-compat evidence for ${method.id}.` }]).ok).toBe(true);
  }
  expect(completeLedger(ledger, "Capsules back-compat check completed.").ok).toBe(true);
  return ledger;
}

function expectation(runId: string) {
  return {
    ...identity(runId),
    role: persona.contract.role,
    contractDigest: persona.contractDigest,
    agentFileDigest: persona.agentFileDigest,
    methodHashes: Object.fromEntries(persona.methods.map((method) => [method.id, method.bodySha256])),
  };
}

function withProviders(source: string, providers: Record<string, string>): string {
  return source.replace(/"providers": \{[\s\S]*?\n  \}/, `"providers": ${JSON.stringify(providers, null, 2).replaceAll("\n", "\n  ")}`);
}

describe("Capsules role policy", () => {
  test("every persona role may use capsule_recall and capsule_analyze", () => {
    expect(roles).toHaveLength(10);
    for (const role of roles) {
      const runtime = new PersonaChildRuntime({
        identity: { runtimeName: `persona-team.${role}`, runId: `capsules-policy-${role}-${runSequence++}`, childIndex: 0 },
        personaPath: join(agentsDir, `${role}.md`),
        workspace: root,
        attestationDir: join(root, ".tmp-attestations"),
        toolNames: ["capsule_recall", "capsule_analyze"],
      });
      expect(runtime.toolCall("capsule_recall", { ref: "nev1_example" }), role).toMatchObject({ allowed: true, reason: "approved read-only provider operation" });
      expect(runtime.toolCall("capsule_recall", { ref: "nev1_example", view: "source", offset: 0, limit: 4096, query: "TODO" }).allowed, role).toBe(true);
      expect(runtime.toolCall("capsule_analyze", { ref: "nev1_example", op: "find", queries: ["E_TIMEOUT"] }).allowed, role).toBe(true);
      expect(runtime.toolCall("capsule_analyze", { scope: "session", op: "find", queries: ["E_TIMEOUT"] }).allowed, role).toBe(true);
      expect(runtime.toolCall("capsule_analyze", { ref: "nev1_example", op: "outline", language: "ts" }).allowed, role).toBe(true);
      expect(runtime.toolCall("capsule_analyze", { ref: "nev1_example", op: "aggregate", format: "csv", groupBy: "region", measures: [{ fn: "sum", column: "ms" }] }).allowed, role).toBe(true);
      expect(runtime.handle({ action: "status" }).status?.providers.capsules).toMatchObject({ availability: "available", status: "used", uses: 6 });
    }
  });

  test("capsule tools do not widen any other boundary", () => {
    for (const role of roles) {
      const runtime = new PersonaChildRuntime({
        identity: { runtimeName: `persona-team.${role}`, runId: `capsules-deny-${role}-${runSequence++}`, childIndex: 0 },
        personaPath: join(agentsDir, `${role}.md`),
        workspace: root,
        attestationDir: join(root, ".tmp-attestations"),
        toolNames: ["capsule_recall", "capsule_analyze"],
      });
      for (const lookalike of ["capsule_write", "capsule_recall_exec", "capsule_analyze2", "capsules_admin", "mcp__capsules__capsule_recall", "capsule_execute"]) {
        expect(runtime.toolCall(lookalike, { ref: "nev1_example" }).allowed, `${role}: ${lookalike}`).toBe(false);
      }
      expect(runtime.toolCall("bash", { command: "rm -rf extensions" }).allowed, role).toBe(false);
      expect(runtime.toolCall("bash", { command: "git commit -m capsules" }).allowed, role).toBe(false);
      expect(runtime.toolCall("ctx_execute", { language: "javascript", code: "process.exit(1)" }).allowed, role).toBe(false);
      expect(runtime.toolCall("write", { path: "/tmp/capsules-escape.txt", content: "x" }).allowed, role).toBe(false);
      expect(runtime.toolCall("subagent", { agent: "persona-team.qa-lead" }).allowed, role).toBe(false);
    }
  });

  test("strict verification still gates capsule tools behind method activation", () => {
    const runtime = new PersonaChildRuntime({
      identity: identity(`capsules-strict-${runSequence++}`),
      personaPath: emPath,
      workspace: root,
      attestationDir: join(root, ".tmp-attestations"),
      toolNames: ["capsule_recall"],
      verificationPolicy: "strict",
    });
    expect(runtime.handle({ action: "status" }).ok).toBe(true);
    expect(runtime.toolCall("capsule_recall", { ref: "nev1_example" })).toMatchObject({ allowed: false, missingMethods: expect.any(Array) });
  });
});

describe("Capsules persona contract", () => {
  const source = readFileSync(emPath, "utf8");

  test("legacy contextMode-only contracts still parse, with a warning", () => {
    const legacy = parsePersonaFile(withProviders(source, { contextMode: "required_if_available_and_relevant", jcodemunch: "required_if_available_and_relevant", nativeFallback: "allowed_with_degraded_evidence" }));
    expect(legacy.valid, legacy.errors.join("; ")).toBe(true);
    expect(legacy.warnings).toEqual(expect.arrayContaining([expect.stringContaining("legacy contextMode")]));
  });

  test("a contract must declare a supported context provider policy", () => {
    const neither = parsePersonaFile(withProviders(source, { jcodemunch: "required_if_available_and_relevant", nativeFallback: "allowed_with_degraded_evidence" }));
    expect(neither.valid).toBe(false);
    expect(neither.errors).toContain("Capsules provider policy is missing");
    const badCapsules = parsePersonaFile(withProviders(source, { capsules: "optional", jcodemunch: "required_if_available_and_relevant", nativeFallback: "allowed_with_degraded_evidence" }));
    expect(badCapsules.errors).toContain("Capsules provider policy is unsupported");
    const badLegacy = parsePersonaFile(withProviders(source, { capsules: "required_if_available_and_relevant", contextMode: "optional", jcodemunch: "required_if_available_and_relevant", nativeFallback: "allowed_with_degraded_evidence" }));
    expect(badLegacy.errors).toContain("context-mode provider policy is unsupported");
  });
});

describe("legacy context-mode ledgers and attestations", () => {
  test("fresh ledgers record capsules and omit contextMode", () => {
    const ledger = createLedger(persona, identity(`capsules-fresh-${runSequence++}`));
    expect(Object.keys(ledger.providers).sort()).toEqual(["capsules", "jcodemunch", "native"]);
  });

  test("a persisted ledger with a contextMode key and no capsules key still loads", () => {
    const runId = `capsules-legacy-ledger-${runSequence++}`;
    const snapshot = JSON.parse(serializeLedger(completedLedger(runId)));
    snapshot.providers.contextMode = { availability: "available", status: "pending", uses: 0, failures: 0, fallbackUses: 0 };
    delete snapshot.providers.capsules;
    const restored = restoreLedgerSnapshot(snapshot, persona, identity(runId));
    expect(restored.providers.contextMode).toMatchObject({ availability: "available", status: "pending" });
    expect(restored.providers.capsules).toMatchObject({ availability: "unavailable", status: "unavailable", uses: 0 });
    // A legacy provider can no longer be observed, so it cannot block completion.
    expect(ledgerDeficiencies(restored)).toEqual([]);

    const forged = JSON.parse(JSON.stringify(snapshot));
    forged.providers.contextMode.status = "hacked";
    expect(() => restoreLedgerSnapshot(forged, persona, identity(runId))).toThrow("invalid persisted provider state: contextMode");
    const missingCode = JSON.parse(JSON.stringify(snapshot));
    delete missingCode.providers.jcodemunch;
    expect(() => restoreLedgerSnapshot(missingCode, persona, identity(runId))).toThrow("invalid persisted provider state: jcodemunch");
  });

  test("attestations verify with capsules or legacy contextMode, never with neither", () => {
    const runId = `capsules-legacy-attestation-${runSequence++}`;
    const attestation = createAttestation(completedLedger(runId));
    expect(attestation.providers).toHaveProperty("capsules");
    expect(verifyAttestation(attestation, expectation(runId))).toEqual({ valid: true, errors: [] });

    const { capsules, ...rest } = attestation.providers;
    const legacy = { ...attestation, providers: { ...rest, contextMode: capsules } };
    expect(verifyAttestation(legacy, expectation(runId))).toEqual({ valid: true, errors: [] });
    const directory = mkdtempSync(join(tmpdir(), "persona-capsules-legacy-attestation-"));
    try {
      const restored = readAttestation(writeAttestation(legacy as typeof attestation, directory));
      expect(restored.providers.contextMode).toEqual(capsules);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }

    const neither = verifyAttestation({ ...attestation, providers: rest }, expectation(runId));
    expect(neither.valid).toBe(false);
    expect(neither.errors).toEqual(expect.arrayContaining(["invalid provider state: capsules", "provider obligations are missing"]));
    const forgedLegacy = verifyAttestation({ ...attestation, providers: { ...rest, contextMode: { ...capsules, uses: -1 } } }, expectation(runId));
    expect(forgedLegacy.errors).toContain("invalid provider state: contextMode");
  });
});

describe("Capsules provider adapter", () => {
  test("reports absence, forwards recall/analyze, and surfaces failures", async () => {
    expect(await new CapsulesProvider(undefined).detect()).toMatchObject({ status: "unavailable" });
    expect(await new CapsulesProvider(undefined).recall({ ref: "nev1_example" })).toMatchObject({ status: "unavailable" });
    const calls: unknown[] = [];
    const provider = new CapsulesProvider({
      recall: async (input) => { calls.push(input); return "page"; },
      analyze: async () => { throw new Error("Capsules unavailable: context-owner-conflict."); },
    });
    expect(await provider.detect()).toEqual({ status: "available" });
    expect(await provider.recall({ ref: "nev1_example", query: "TODO" })).toEqual({ status: "available", value: "page" });
    expect(calls).toEqual([{ ref: "nev1_example", query: "TODO" }]);
    expect(await provider.analyze({ op: "find", ref: "nev1_example", queries: ["TODO"] })).toEqual({ status: "failed", reason: "Capsules unavailable: context-owner-conflict." });
  });
});
