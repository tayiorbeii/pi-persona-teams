import { expect, test } from "bun:test";
import { join } from "node:path";
import { packagePreflight, personaDoctor } from "../extensions/internal/persona-facade.ts";

const root = join(import.meta.dir, "..");
const canonicalDiscoveries = [
  "persona-team.founder-ceo",
  "persona-team.product-designer",
  "persona-team.devex-lead",
  "persona-team.engineering-manager",
  "persona-team.implementation-engineer",
  "persona-team.staff-reviewer",
  "persona-team.security-officer",
  "persona-team.qa-lead",
  "persona-team.release-engineer",
  "persona-team.retro-ops-manager",
].map((runtimeName) => ({ runtimeName, source: "package" as const, packageName: "persona-team" }));

test("Engineering Manager preflight binds canonical agent and child extension", () => {
  const result = packagePreflight(root, "persona-team.engineering-manager");
  expect(result.valid).toBe(true);
  expect(result.persona?.contract.runtimeName).toBe("persona-team.engineering-manager");
  expect(result.childExtension.endsWith("extensions/persona-child.ts")).toBe(true);
});

test("doctor reports an unauthorized project shadow", async () => {
  const result = await personaDoctor({ packageRoot: root, workspace: root, discover: () => [
    ...canonicalDiscoveries,
    { runtimeName: "persona-team.engineering-manager", source: "project" },
  ] });
  expect(result.ready).toBe(false);
  expect(result.deficiencies.some((item) => item.includes("shadow"))).toBe(true);
});
