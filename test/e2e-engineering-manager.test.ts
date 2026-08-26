import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { verifyAttestation } from "../extensions/internal/attestation.ts";
import { validatePersonaFile } from "../extensions/internal/persona-file.ts";

const root = join(import.meta.dir, "..");

test("Engineering Manager tracer produces a plan artifact without source edits", () => {
  const workspace = mkdtempSync(join(tmpdir(), "engineering-manager-tracer-"));
  mkdirSync(join(workspace, "src"));
  writeFileSync(join(workspace, "src", "index.ts"), "export const fixture = true;\n");
  const personaPath = join(root, "agents", "engineering-manager.md");
  const child = new PersonaChildRuntime({ identity: { runtimeName: "persona-team.engineering-manager", runId: "e2e-plan", childIndex: 0 }, personaPath, workspace, attestationDir: join(workspace, ".attestations") });
  expect(child.handle({ action: "status" }).ok).toBe(true);
  const methods = validatePersonaFile(personaPath).persona?.contract.requiredMethods ?? [];
  for (const method of methods) expect(child.handle({ action: "activate", method, plannedApplication: `Apply ${method} to the fixture repository plan.` }).ok).toBe(true);
  expect(child.toolCall("read", { path: "src/index.ts" }).allowed).toBe(true);
  expect(child.toolCall("write", { path: "src/index.ts" }).allowed).toBe(false);
  expect(child.toolCall("write", { path: "docs/plans/engineering-manager-plan.md" }).allowed).toBe(true);
  mkdirSync(join(workspace, "docs", "plans"), { recursive: true });
  writeFileSync(join(workspace, "docs/plans/engineering-manager-plan.md"), "# Ordered build queue\n\n- Inspect fixture evidence\n- Implement the smallest slice\n");
  expect(readFileSync(join(workspace, "src/index.ts"), "utf8")).toContain("fixture");
  for (const method of methods) expect(child.handle({ action: "disposition", method, disposition: "applied", evidence: [{ kind: "artifact-section", path: "docs/plans/engineering-manager-plan.md", locator: "Ordered build queue", summary: `Plan records concrete application of ${method}.` }] }).ok).toBe(true);
  const done = child.handle({ action: "complete", outputSummary: "Produced a bounded engineering plan artifact." });
  expect(done.ok).toBe(true);
  expect(done.attestation?.policy.blockedCalls).toBe(1);
  expect(verifyAttestation(done.attestation, { runtimeName: "persona-team.engineering-manager", runId: "e2e-plan", childIndex: 0, methodHashes: Object.fromEntries((validatePersonaFile(personaPath).persona?.methods ?? []).map((method) => [method.id, method.bodySha256])) }).valid).toBe(true);
});
