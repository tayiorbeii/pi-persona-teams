import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";

const root = join(import.meta.dir, "..");
const writerMethods = ["persona-team-clean-code", "persona-team-refactoring-patterns", "persona-team-software-design-philosophy", "persona-team-pragmatic-programmer"];
const reviewerMethods = ["persona-team-clean-code", "persona-team-clean-architecture", "persona-team-refactoring-patterns", "persona-team-software-design-philosophy"];
let runSequence = 0;

function activatedRuntime(role: "implementation-engineer" | "staff-reviewer", workspace = root): PersonaChildRuntime {
  const runtime = new PersonaChildRuntime({
    identity: { runtimeName: `persona-team.${role}`, runId: `role-policy-${role}-${runSequence++}`, childIndex: 0 },
    personaPath: join(root, "agents", `${role}.md`),
    workspace,
    attestationDir: join(root, ".tmp-attestations"),
  });
  const methods = role === "implementation-engineer" ? writerMethods : reviewerMethods;
  for (const method of methods) {
    const result = runtime.handle({ action: "activate", method, plannedApplication: `Exercise ${method} while verifying the role-policy boundary.` });
    expect(result.ok).toBe(true);
  }
  return runtime;
}

const adversarialCommands = [
  "git status; rm -rf .",
  "git status && git push",
  "cat README.md | tee agents/implementation-engineer.md",
  "pwd\nrm -rf .",
  "ls $(touch escaped)",
  "sh -c 'rm -rf .'",
  "bash -c 'git push'",
  "python -c 'open(\"agents/implementation-engineer.md\", \"w\").write(\"x\")'",
  "node -e 'require(\"fs\").writeFileSync(\"package.json\", \"{}\")'",
  "cat README.md > package.json",
  "cmd.exe /c type README.md > package.json",
  "powershell.exe -Command Set-Content package.json '{}'.",
  "pwsh -c 'Set-Content package.json {}'",
  "find . -delete",
  "find . -exec rm -rf {} +",
  "find . -execdir rm -rf {} +",
  "find . -ok rm -rf {} +",
  "find . -okdir rm -rf {} +",
];

test("shell commands fail closed for compound syntax, interpreters, and writers", () => {
  for (const role of ["implementation-engineer", "staff-reviewer"] as const) {
    const runtime = activatedRuntime(role);
    for (const command of adversarialCommands) {
      expect(runtime.toolCall("bash", { command }).allowed, `${role} unexpectedly allowed: ${command}`).toBe(false);
    }
  }
});

test("approved validation and bounded read commands remain available", () => {
  const writer = activatedRuntime("implementation-engineer");
  expect(writer.toolCall("bash", { command: "bun test test/writer-reviewer.test.ts" }).allowed).toBe(true);
  expect(writer.toolCall("shell", { command: "npm run typecheck" }).allowed).toBe(true);

  const reviewer = activatedRuntime("staff-reviewer");
  expect(reviewer.toolCall("bash", { command: "git status --short" }).allowed).toBe(true);
  expect(reviewer.toolCall("bash", { command: "node --version" }).allowed).toBe(true);
});

test("provider-looking aliases do not acquire mutation authority", () => {
  const runtime = activatedRuntime("staff-reviewer");
  expect(runtime.toolCall("mcp__evil__write", { path: "/etc/passwd", content: "owned" }).allowed).toBe(false);
  expect(runtime.toolCall("mcp:evil:write", { path: "/etc/passwd", content: "owned" }).allowed).toBe(false);
  expect(runtime.toolCall("mcp__jcodemunch__write_file", { path: "/etc/passwd", content: "owned" }).allowed).toBe(false);
  expect(runtime.toolCall("jcodemunch_search_symbols", { query: "role policy" }).allowed).toBe(true);
});

test("every structured write destination is checked", () => {
  const runtime = activatedRuntime("implementation-engineer");
  expect(runtime.toolCall("write_file", { path: "src/generated.ts", target: "agents/implementation-engineer.md", content: "x" }).allowed).toBe(false);
  expect(runtime.toolCall("copy", { path: "src/source.ts", destination: "extensions/internal/role-policy.ts" }).allowed).toBe(false);
  expect(runtime.toolCall("write_file", { path: ".pi-persona/ledgers/child.json", content: "{}" }).allowed).toBe(false);
  expect(runtime.toolCall("write_file", { path: ".pi-persona/attestations/child.json", content: "{}" }).allowed).toBe(false);
  expect(runtime.toolCall("write_file", { path: "src/generated.ts", target: 42, content: "x" }).allowed).toBe(false);
  expect(runtime.toolCall("write_file", { path: "src/generated.ts", content: "export {};" }).allowed).toBe(true);
});

test("structured writes cannot escape or hide protected paths behind symlinks", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "role-policy-"));
  const workspace = join(temporaryRoot, "workspace");
  const outside = join(temporaryRoot, "outside");
  mkdirSync(join(workspace, "agents"), { recursive: true });
  mkdirSync(outside);
  symlinkSync(outside, join(workspace, "escape"), "dir");
  symlinkSync(join(workspace, "agents"), join(workspace, "apparently-safe"), "dir");

  try {
    const runtime = activatedRuntime("implementation-engineer", workspace);
    expect(runtime.toolCall("write_file", { path: "escape/new.ts", content: "x" }).allowed).toBe(false);
    expect(runtime.toolCall("write_file", { path: "apparently-safe/new.md", content: "x" }).allowed).toBe(false);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
