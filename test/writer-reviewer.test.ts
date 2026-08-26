import { expect, test } from "bun:test";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";

const root = join(import.meta.dir, "..");
const writerMethods = ["persona-team-clean-code", "persona-team-refactoring-patterns", "persona-team-software-design-philosophy", "persona-team-pragmatic-programmer"];
const reviewerMethods = ["persona-team-clean-code", "persona-team-clean-architecture", "persona-team-refactoring-patterns", "persona-team-software-design-philosophy"];
function child(role: string) {
  const runtime = new PersonaChildRuntime({ identity: { runtimeName: `persona-team.${role}`, runId: `${role}-run`, childIndex: 0 }, personaPath: join(root, "agents", `${role}.md`), workspace: root, attestationDir: join(root, ".tmp-attestations") });
  expect(runtime.handle({ action: "status" }).ok).toBe(true);
  return runtime;
}

test("Implementation Engineer writes only in scope and cannot release", () => {
  const runtime = child("implementation-engineer");
  for (const method of writerMethods) expect(runtime.handle({ action: "activate", method, plannedApplication: `Apply ${method} to the bounded candidate change.` }).ok).toBe(true);
  expect(runtime.toolCall("write", { path: "src/product.ts" }).allowed).toBe(true);
  expect(runtime.toolCall("write", { path: "../outside.ts" }).allowed).toBe(false);
  expect(runtime.toolCall("write", { path: "extensions/persona-child.ts" }).allowed).toBe(false);
  expect(runtime.toolCall("bash", { command: "bun test test/*.test.ts" }).allowed).toBe(true);
  expect(runtime.toolCall("bash", { command: "npm publish" }).allowed).toBe(false);
  for (const method of writerMethods) runtime.handle({ action: "disposition", method, disposition: "applied", evidence: [{ kind: "test-result", summary: `${method} shaped the candidate and its tests.` }] });
  expect(runtime.handle({ action: "complete", outputSummary: "Candidate implementation and evidence prepared." }).ok).toBe(true);
});

test("Staff Reviewer is read-only and can produce an independent review artifact", () => {
  const runtime = child("staff-reviewer");
  for (const method of reviewerMethods) expect(runtime.handle({ action: "activate", method, plannedApplication: `Apply ${method} while reviewing the candidate change.` }).ok).toBe(true);
  expect(runtime.toolCall("read", { path: "src/product.ts" }).allowed).toBe(true);
  expect(runtime.toolCall("write", { path: "src/product.ts" }).allowed).toBe(false);
  expect(runtime.toolCall("write", { path: "docs/reviews/candidate.md" }).allowed).toBe(true);
  for (const method of reviewerMethods) runtime.handle({ action: "disposition", method, disposition: "applied", evidence: [{ kind: "artifact-section", path: "docs/reviews/candidate.md", summary: `${method} produced a structured independent finding.` }] });
  expect(runtime.handle({ action: "complete", outputSummary: "Independent review findings prepared." }).ok).toBe(true);
});
