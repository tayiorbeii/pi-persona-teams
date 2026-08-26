import { expect, test } from "bun:test";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { validatePersonaFile } from "../extensions/internal/persona-file.ts";

const root = join(import.meta.dir, "..");
const roles = ["security-officer", "qa-lead", "product-designer", "devex-lead", "founder-ceo", "release-engineer", "retro-ops-manager"];

for (const role of roles) {
  test(`${role} representative task respects its independent authority`, () => {
    const personaPath = join(root, "agents", `${role}.md`);
    const validation = validatePersonaFile(personaPath);
    if (!validation.persona) throw new Error(validation.errors.join("; "));
    const child = new PersonaChildRuntime({ identity: { runtimeName: `persona-team.${role}`, runId: `${role}-representative`, childIndex: 0 }, personaPath, workspace: root, attestationDir: join(root, ".tmp-attestations") });
    expect(child.handle({ action: "status" }).ok).toBe(true);
    for (const method of validation.persona.contract.requiredMethods) expect(child.handle({ action: "activate", method, plannedApplication: `Apply ${method} to the bounded ${role} representative task.` }).ok).toBe(true);
    expect(child.toolCall("read", { path: "README.md" }).allowed).toBe(true);
    expect(child.toolCall("write", { path: "src/product.ts" }).allowed).toBe(false);
    for (const method of validation.persona.contract.requiredMethods) expect(child.handle({ action: "disposition", method, disposition: "applied", evidence: [{ kind: "tool-result", path: "README.md", summary: `${role} recorded concrete evidence for ${method}.` }] }).ok).toBe(true);
    const result = child.handle({ action: "complete", outputSummary: `Produced the bounded ${role} representative artifact.` });
    expect(result.ok).toBe(true);
    expect(result.attestation?.status).toBe("passed");
  });
}
