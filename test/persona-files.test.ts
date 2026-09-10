import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listPersonas } from "../extensions/internal/persona-facade.ts";
import { parsePersonaFile, validatePersonaFile } from "../extensions/internal/persona-file.ts";

const root = join(import.meta.dir, "..");

const expectedMethods: Record<string, string[]> = {
  "engineering-manager": ["persona-team-domain-driven-design", "persona-team-system-design", "persona-team-ddia-systems", "persona-team-clean-architecture"],
  "implementation-engineer": ["persona-team-clean-code", "persona-team-refactoring-patterns", "persona-team-software-design-philosophy", "persona-team-pragmatic-programmer"],
  "staff-reviewer": ["persona-team-clean-code", "persona-team-clean-architecture", "persona-team-refactoring-patterns", "persona-team-software-design-philosophy"],
  "security-officer": ["persona-team-clean-architecture", "persona-team-ddia-systems", "persona-team-domain-driven-design"],
  "qa-lead": ["persona-team-pragmatic-programmer", "persona-team-release-it", "persona-team-ux-heuristics"],
  "product-designer": ["persona-team-inspired-product", "persona-team-jobs-to-be-done", "persona-team-mom-test", "persona-team-lean-ux", "persona-team-continuous-discovery", "persona-team-design-sprint", "persona-team-ux-heuristics"],
  "devex-lead": ["persona-team-pragmatic-programmer", "persona-team-system-design", "persona-team-high-perf-browser", "persona-team-web-typography"],
  "founder-ceo": ["persona-team-inspired-product", "persona-team-jobs-to-be-done", "persona-team-blue-ocean-strategy", "persona-team-lean-startup"],
  "release-engineer": ["persona-team-release-it"],
  "retro-ops-manager": ["persona-team-traction-eos", "persona-team-drive-motivation", "persona-team-pragmatic-programmer"],
};

describe("independent persona files", () => {
  test("all ten canonical files validate with literal method sets", () => {
    const summaries = listPersonas(root);
    expect(summaries).toHaveLength(10);
    for (const [role, methods] of Object.entries(expectedMethods)) {
      const result = validatePersonaFile(join(root, "agents", `${role}.md`));
      expect(result.valid, `${role}: ${result.errors.join("; ")}`).toBe(true);
      expect(result.persona?.contract.requiredMethods).toEqual(methods);
      expect(result.persona?.methods.map((method) => method.id)).toEqual(methods);
    }
  });

  test("every persona declares an explicit tool allowlist with persona_contract and MCP direct tools, and inherits extensions, skills, and project settings", () => {
    for (const role of Object.keys(expectedMethods)) {
      const source = readFileSync(join(root, "agents", `${role}.md`), "utf8");
      // pi-subagents only grants subagents direct MCP tools when `mcp:` entries are
      // listed in the agent's `tools` allowlist; the allowlist must also keep the
      // persona-child extension's persona_contract tool. (See pi-subagents README
      // "Tool and extension selection".)
      expect(source, role).toMatch(/^tools: .*persona_contract/m);
      expect(source, role).toMatch(/^tools: .*mcp:context-mode\/ctx_execute/m);
      expect(source, role).toMatch(/^tools: .*mcp:jcodemunch\/search_symbols/m);
      expect(source, role).toMatch(/^tools: .*mcp:jdocmunch\/search_sections/m);
      expect(source, role).not.toMatch(/^extensions:/m);
      expect(source, role).toContain("inheritProjectContext: true");
      expect(source, role).toContain("inheritSkills: true");
      expect(source, role).toContain("subagentOnlyExtensions: ../extensions/persona-child.ts");
      expect(source, role).toContain("timeoutMs: 600000");
      expect(source, role).toContain('turnBudget: {"maxTurns":8,"graceTurns":1}');
      expect(source, role).toContain('toolBudget: {"soft":12,"hard":18,"block":["*"]}');
      expect(source, role).toContain("## Runtime Resource Gate");
      expect(source, role).toContain("persona_contract.status");
      expect(source, role).toContain("octocode-research");
      expect(source, role).toContain("npx -y octocode@18.3.0");
      expect(source, role).toContain("cannot override this exact-version policy");
      expect(source, role).not.toContain("octocode@latest");
      expect(source, role).toContain("ponytail");
      expect(source, role).toContain("i-have-adhd");
    }
  });

  test("persona-team dispatch guidance requires schemas, small fan-out, and bounded finalization", () => {
    const source = readFileSync(join(root, "skills", "persona-team", "SKILL.md"), "utf8");
    expect(source).toContain("outputSchema");
    expect(source).toContain("toolVisibility");
    expect(source).toContain("At most two concurrent personas");
    expect(source).toContain("Partial or timed-out child transcripts are not evidence");
    expect(source).toContain("octocode-research");
    expect(source).toContain("npx -y octocode@18.3.0");
    expect(source).toContain("cannot override this exact-version policy");
    expect(source).not.toContain("octocode@latest");
    expect(source).toContain("ponytail");
    expect(source).toContain("i-have-adhd");
  });

  test("every canonical persona validates from an isolated copy", () => {
    for (const role of Object.keys(expectedMethods)) {
      const directory = mkdtempSync(join(tmpdir(), `persona-independent-${role}-`));
      const file = join(directory, `${role}.md`);
      copyFileSync(join(root, "agents", `${role}.md`), file);
      const result = validatePersonaFile(file);
      expect(result.valid, `${role}: ${result.errors.join("; ")}`).toBe(true);
      expect(result.persona?.contract.runtimeName).toBe(`persona-team.${role}`);
      expect(result.persona?.methods.map((method) => method.id)).toEqual(expectedMethods[role]);
    }
  });

  test("a copied method body hash mismatch identifies the method", () => {
    const source = readFileSync(join(root, "agents", "engineering-manager.md"), "utf8");
    const tampered = source.replace(/("bodySha256":\s*")[a-f0-9]+("\s*\})/, "$1" + "0".repeat(64) + "$2");
    const result = parsePersonaFile(tampered, "engineering-manager.md");
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("body hash mismatch for persona-team-domain-driven-design"))).toBe(true);
  });

  test("a named method without its copied body is rejected", () => {
    const source = readFileSync(join(root, "agents", "engineering-manager.md"), "utf8");
    const missing = source.replace(/<pi-persona-method-body id="persona-team-system-design">[\s\S]*?<\/pi-persona-method-body>/, "");
    const result = parsePersonaFile(missing, "engineering-manager.md");
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("missing embedded method: persona-team-system-design"))).toBe(true);
  });
});
