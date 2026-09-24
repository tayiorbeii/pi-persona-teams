import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { listPersonas, personaDoctor, runPersona } from "../extensions/internal/persona-facade.ts";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { sha256, validatePersonaFile } from "../extensions/internal/persona-file.ts";
import { ProviderObserver } from "../extensions/internal/provider-observer.ts";

const root = join(import.meta.dir, "..");
const em = join(root, "agents", "engineering-manager.md");
const methods = ["persona-team-domain-driven-design", "persona-team-system-design", "persona-team-ddia-systems", "persona-team-clean-architecture"];
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

test("facade list and doctor work with neither optional provider", async () => {
  expect(listPersonas(root)).toHaveLength(10);
  const doctor = await personaDoctor({ packageRoot: root, workspace: root, discover: () => canonicalDiscoveries, toolNames: [], environment: {} });
  expect(doctor.baselineReady).toBe(true);
  expect(doctor.providers.contextMode.availability).toBe("unavailable");
  expect(doctor.providers.jcodemunch.availability).toBe("unavailable");
});

test("facade accepts only dual persona and ordinary acceptance", async () => {
  const attemptStartedAt = Date.now();
  const launchContractDigest = sha256(JSON.stringify({
    agent: "persona-team.engineering-manager",
    task: "Produce a bounded engineering plan.",
    context: "fresh",
    cwd: root,
    childExtension: join(root, "extensions", "persona-child.ts"),
  }));
  // pi-subagents 0.60.0 does not propagate the parent digest into the child environment.
  const identity = { runtimeName: "persona-team.engineering-manager", runId: "facade-run", childIndex: 0 };
  const child = new PersonaChildRuntime({ identity, personaPath: em, workspace: root, attestationDir: join(root, ".tmp-attestations") });
  expect(child.handle({ action: "status" }).ok).toBe(true);
  for (const method of methods) child.handle({ action: "activate", method, plannedApplication: `Use ${method} to shape the requested plan.` });
  for (const method of methods) child.handle({ action: "disposition", method, disposition: "applied", evidence: [{ kind: "artifact-section", path: "docs/plans/engineering.md", summary: `Evidence records ${method} application.` }] });
  const complete = child.handle({ action: "complete", outputSummary: "Plan produced." });
  const accepted = await runPersona({ packageRoot: root, workspace: root, attemptStartedAt, delegate: async () => ({ runId: "facade-run", childIndex: 0, output: "Plan produced.", attestation: complete.attestation, launchContractDigest, ordinaryAccepted: true }) }, "persona-team.engineering-manager", "Produce a bounded engineering plan.");
  expect(accepted.accepted).toBe(true);
  expect(accepted.launchContractDigest).toBe(launchContractDigest);
  const failedAttestation = { ...complete.attestation!, status: "failed" as const, failureReasons: ["child failed"] };
  const rejected = await runPersona({ packageRoot: root, workspace: root, delegate: async () => ({ runId: "facade-run", childIndex: 0, attestation: failedAttestation, launchContractDigest }) }, "persona-team.engineering-manager", "Produce a bounded engineering plan.");
  expect(rejected.accepted).toBe(false);
  const missing = await runPersona({ packageRoot: root, workspace: root, delegate: async () => ({ runId: "facade-run", childIndex: 0, launchContractDigest }) }, "persona-team.engineering-manager", "Produce a bounded engineering plan.");
  expect(missing.accepted).toBe(false);
});

describe("provider routing", () => {
  test("absence is usable and a failed provider grants one native fallback", () => {
    const baseline = new ProviderObserver({ toolNames: [] });
    expect(baseline.availability("contextMode")).toBe("unavailable");
    const available = new ProviderObserver({ toolNames: ["jcodemunch_search_symbols"] });
    expect(available.availability("jcodemunch")).toBe("available");
    expect(available.shouldRedirect("jcodemunch", "code-orientation")).toBe(true);
    available.failed("jcodemunch", "code-orientation", "provider call failed");
    expect(available.allowFallback("jcodemunch", "code-orientation")).toBe(true);
    expect(available.allowFallback("jcodemunch", "code-orientation")).toBe(false);
    expect(available.shouldRedirect("jcodemunch", "code-orientation")).toBe(false);
  });
});
