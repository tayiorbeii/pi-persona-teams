import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { readAttestation, verifyAttestation } from "../extensions/internal/attestation.ts";
import { validatePersonaFile } from "../extensions/internal/persona-file.ts";

const root = join(import.meta.dir, "..");
const personaPath = join(root, "agents", "engineering-manager.md");
const methods = [
  "persona-team-domain-driven-design",
  "persona-team-system-design",
  "persona-team-ddia-systems",
  "persona-team-clean-architecture",
];

test("child contract status, ledger completion, and persisted attestation stay consistent", () => {
  const workspace = mkdtempSync(join(tmpdir(), "persona-persisted-lifecycle-"));
  const attestationDir = join(workspace, "attestations");
  try {
    const child = new PersonaChildRuntime({
      identity: { runtimeName: "persona-team.engineering-manager", runId: "persisted-lifecycle", childIndex: 2 },
      personaPath,
      workspace,
      attestationDir,
      toolNames: ["ctx_search"],
      verificationPolicy: "strict",
    });
    expect(child.toolCall("read", { path: "README.md" })).toMatchObject({ allowed: false, reason: expect.stringContaining("persona_contract.status") });
    const initial = child.handle({ action: "status" });
    expect(initial.status?.completionStatus).toBe("open");
    expect(initial.status?.requiredMethods.every((method) => !method.activated)).toBe(true);

    for (const method of methods) {
      expect(child.handle({ action: "activate", method, plannedApplication: `Apply ${method} to the bounded planning task.` }).ok).toBe(true);
    }
    const activated = child.handle({ action: "status" });
    expect(activated.status?.requiredMethods.every((method) => method.activated)).toBe(true);
    expect(activated.status?.toolVisibility.available).toEqual(["ctx_search"]);
    expect(child.toolCall("context-mode.search", { query: "bounded context" }).allowed).toBe(true);
    expect(child.toolCall("structured_output", { summary: "Bounded structured finalization." })).toMatchObject({ allowed: true, substantive: true });
    expect(activated.status?.completionStatus).toBe("open");

    for (const method of methods) {
      expect(child.handle({
        action: "disposition",
        method,
        disposition: "applied",
        evidence: [{ kind: "artifact-section", path: "docs/plans/engineering.md", locator: method, summary: `The plan records evidence from ${method}.` }],
      }).ok).toBe(true);
    }
    const completed = child.handle({ action: "complete", outputSummary: "Produced the bounded planning artifact." });
    expect(completed.ok).toBe(true);
    expect(completed.status?.completionStatus).toBe("passed");
    if (!completed.attestation || !completed.attestationPath) throw new Error(completed.message);
    expect(existsSync(completed.attestationPath)).toBe(true);
    expect(readFileSync(completed.attestationPath, "utf8")).toContain('"schema": "pi.persona-attestation/v1"');

    const persisted = readAttestation(completed.attestationPath);
    expect(persisted).toEqual(completed.attestation);
    expect(verifyAttestation(persisted, {
      runtimeName: "persona-team.engineering-manager",
      runId: "persisted-lifecycle",
      childIndex: 2,
      contractDigest: validatePersonaFile(personaPath).persona?.contractDigest,
      agentFileDigest: validatePersonaFile(personaPath).persona?.agentFileDigest,
      methodHashes: Object.fromEntries((validatePersonaFile(personaPath).persona?.methods ?? []).map((method) => [method.id, method.bodySha256])),
    }).valid).toBe(true);
    expect(child.attestation()).toEqual(persisted);
    expect(persisted.providers.contextMode).toMatchObject({ availability: "available", status: "used", uses: 1 });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
