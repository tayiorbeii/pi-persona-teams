import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { buildDelegationRequest, resolvePersonaWorkspace } from "../extensions/persona-parent.ts";

const root = join(import.meta.dir, "..");
const reviewerMethods = ["persona-team-clean-code", "persona-team-clean-architecture", "persona-team-refactoring-patterns", "persona-team-software-design-philosophy"];
const external = mkdtempSync(join(tmpdir(), "persona-workspace-"));
mkdirSync(join(external, ".git"));
writeFileSync(join(external, "publisher.py"), "def publish(url):\n    return url\n");

afterAll(() => rmSync(external, { recursive: true, force: true }));

test("workspace defaults to the parent cwd and resolves relative paths against it", () => {
  expect(resolvePersonaWorkspace(undefined, root)).toEqual({ ok: true, workspace: root });
  expect(resolvePersonaWorkspace("  ", root)).toEqual({ ok: true, workspace: root });
  expect(resolvePersonaWorkspace("test", root)).toEqual({ ok: true, workspace: resolve(root, "test") });
  expect(resolvePersonaWorkspace(external, root)).toEqual({ ok: true, workspace: external });
});

test("workspace must be an existing directory", () => {
  expect(resolvePersonaWorkspace(join(external, "missing"), root).ok).toBe(false);
  expect(resolvePersonaWorkspace(join(external, "publisher.py"), root).ok).toBe(false);
});

test("the delegation launches the child in the targeted workspace", () => {
  const request = buildDelegationRequest({ requestId: "r", ownerRunId: "o", nodeId: "n", agent: "persona-team.staff-reviewer", task: "review", context: "fresh", workspace: external, timeoutMs: 1_000 });
  expect(request.cwd).toBe(external);
});

test("a persona scoped to an external checkout can research it but not the parent repository", () => {
  const runtime = new PersonaChildRuntime({
    identity: { runtimeName: "persona-team.staff-reviewer", runId: `workspace-${Date.now()}`, childIndex: 0 },
    personaPath: join(root, "agents", "staff-reviewer.md"),
    workspace: external,
    attestationDir: join(external, ".pi-persona", "attestations"),
  });
  expect(runtime.handle({ action: "status" }).ok).toBe(true);
  for (const method of reviewerMethods) expect(runtime.handle({ action: "activate", method, plannedApplication: `Apply ${method} to the frozen revision.` }).ok).toBe(true);
  const analysis = { language: "javascript", code: "console.log(FILE_CONTENT.length)" };
  expect(runtime.toolCall("context-mode_ctx_execute_file", { path: join(external, "publisher.py"), ...analysis }).allowed).toBe(true);
  expect(runtime.toolCall("context-mode_ctx_batch_execute", { cwd: external, commands: [{ label: "tree", command: "ls" }] }).allowed).toBe(true);
  expect(runtime.toolCall("context-mode_ctx_execute_file", { path: join(root, "package.json"), ...analysis }).allowed).toBe(false);
});
