import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { personaDoctor, runPersona } from "../extensions/internal/persona-facade.ts";

const root = join(import.meta.dir, "..");
const runtimeNames = [
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
];

describe("adversarial parent verification", () => {
  test("rejects a delegation result that omits the immutable launch digest binding", async () => {
    const result = await runPersona({
      packageRoot: root,
      workspace: root,
      delegate: async () => ({
        runId: "missing-response-digest",
        ordinaryAccepted: true,
        attestation: { launchContractDigest: "attested-digest" } as any,
      }),
    }, "persona-team.engineering-manager", "Produce a bounded plan.");

    expect(result.accepted).toBe(false);
    expect(result.personaAccepted).toBe(false);
    expect(result.ordinaryAccepted).toBe(false);
    expect(result.errors).toContain("pi-subagents delegation response is missing the expected launchContractDigest binding");
  });

  test("does not fabricate a missing digest into received attestation evidence", async () => {
    const result = await runPersona({
      packageRoot: root,
      workspace: root,
      delegate: async () => ({
        runId: "missing-attestation-digest",
        launchContractDigest: "expected-digest",
        ordinaryAccepted: true,
        attestation: {} as any,
      }),
    }, "persona-team.engineering-manager", "Produce a bounded plan.");

    expect(result.accepted).toBe(false);
    expect(result.personaAccepted).toBe(false);
    expect(result.errors).toContain("host-authored persona attestation is missing launchContractDigest");
  });

  test("doctor is not ready when preflight validates only one canonical runtime", async () => {
    const result = await personaDoctor({
      packageRoot: root,
      workspace: root,
      discover: () => [{
        runtimeName: "persona-team.engineering-manager",
        source: "package",
        packageName: "persona-team",
      }],
    });

    expect(result.ready).toBe(false);
    expect(result.baselineReady).toBe(false);
    expect(result.deficiencies).toContain("persona-team.founder-ceo is not discoverable through pi-subagents");
  });

  test("doctor reports an actionable integration failure instead of false readiness", async () => {
    const result = await personaDoctor({
      packageRoot: root,
      workspace: root,
      discover: () => { throw new Error("preflight subpath missing"); },
    });

    expect(result.ready).toBe(false);
    expect(result.discoveries).toEqual([]);
    expect(result.deficiencies[0]).toContain("pi-subagents integration is unavailable: preflight subpath missing");
  });

  test("doctor requires all ten canonical runtime names", async () => {
    const result = await personaDoctor({
      packageRoot: root,
      workspace: root,
      discover: () => runtimeNames.map((runtimeName) => ({ runtimeName, source: "package", packageName: "persona-team" })),
    });

    expect(result.deficiencies.filter((item) => item.includes("not discoverable through pi-subagents"))).toEqual([]);
  });
});
