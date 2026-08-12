import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { ledgerPersistencePath } from "../extensions/internal/ledger.ts";
import { validatePersonaFile } from "../extensions/internal/persona-file.ts";

const root = join(import.meta.dir, "..");
const personaPath = join(root, "agents", "engineering-manager.md");
let runSequence = 0;

function runtime() {
  const result = validatePersonaFile(personaPath);
  if (!result.persona) throw new Error(result.errors.join("; "));
  const identity = { runtimeName: "persona-team.engineering-manager", runId: `ledger-policy-${++runSequence}`, childIndex: 0 };
  rmSync(ledgerPersistencePath(identity), { force: true });
  return new PersonaChildRuntime({ identity, personaPath, workspace: root, attestationDir: join(root, ".tmp-attestations") });
}

const plans: Record<string, string> = {
  "persona-team-domain-driven-design": "Map the bounded contexts in the requested repository plan.",
  "persona-team-system-design": "Estimate capacity and reliability trade-offs for the build queue.",
  "persona-team-ddia-systems": "Record storage, consistency, and replication assumptions in the plan.",
  "persona-team-clean-architecture": "Separate use cases, boundaries, and infrastructure in the ordered slices.",
};

describe("Engineering Manager public child policy", () => {
  test("substantive reads are blocked before all methods activate", () => {
    const child = runtime();
    const blocked = child.toolCall("read", { path: "README.md" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("persona-team-domain-driven-design");
    expect(child.handle({ action: "activate", method: "persona-team-domain-driven-design", plannedApplication: "apply the method" }).ok).toBe(false);
    expect(child.handle({ action: "activate", method: "not-embedded", plannedApplication: "Use this for the plan evidence." }).ok).toBe(false);
  });

  test("all four activations admit bounded reads but keep source writes blocked", () => {
    const child = runtime();
    for (const [method, plannedApplication] of Object.entries(plans)) expect(child.handle({ action: "activate", method, plannedApplication }).ok).toBe(true);
    expect(child.toolCall("read", { path: "README.md" }).allowed).toBe(true);
    expect(child.toolCall("write", { path: "extensions/new-source.ts" }).allowed).toBe(false);
    expect(child.toolCall("bash", { command: "git status --short" }).allowed).toBe(true);
    expect(child.toolCall("bash", { command: "git commit -am nope" }).allowed).toBe(false);
    expect(child.toolCall("write", { path: "docs/plans/engineering-plan.md" }).allowed).toBe(true);
  });

  test("completion requires one evidenced terminal disposition for every method", () => {
    const child = runtime();
    for (const [method, plannedApplication] of Object.entries(plans)) child.handle({ action: "activate", method, plannedApplication });
    const incomplete = child.handle({ action: "complete", outputSummary: "plan" });
    expect(incomplete.ok).toBe(false);
    expect(incomplete.deficiencies?.join(" ")).toContain("record dispositions");
    for (const method of Object.keys(plans)) {
      expect(child.handle({ action: "disposition", method, disposition: "applied", evidence: [{ kind: "artifact-section", path: "docs/plans/engineering-plan.md", locator: method, summary: `Plan section records ${method} evidence.` }] }).ok).toBe(true);
    }
    const complete = child.handle({ action: "complete", outputSummary: "Produced the requested engineering plan." });
    expect(complete.ok).toBe(true);
    expect(complete.attestation?.status).toBe("passed");
  });

  test("repair is bounded and terminal after repeated incomplete completion", () => {
    const child = runtime();
    expect(child.handle({ action: "complete", outputSummary: "not ready" }).ok).toBe(false);
    expect(child.handle({ action: "complete", outputSummary: "still not ready" }).ok).toBe(false);
    const terminal = child.handle({ action: "complete", outputSummary: "again" });
    expect(terminal.ok).toBe(false);
    expect(terminal.message).toContain("terminally failed");
  });
});
