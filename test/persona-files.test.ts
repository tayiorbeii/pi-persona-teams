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
