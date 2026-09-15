import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { personaDoctor, runPersona, type DelegationRequest, type DelegationResult } from "../extensions/internal/persona-facade.ts";
import { PERSONA_DELEGATION_RESPONSE_TIMEOUT_MS } from "../extensions/persona-parent.ts";

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
  test("delegation response timeout matches the canonical ten-minute persona budget", () => {
    expect(PERSONA_DELEGATION_RESPONSE_TIMEOUT_MS).toBe(600_000);
  });

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

describe("launch mode run handle", () => {
  test("returns a run handle at bridge acceptance instead of blocking for terminal completion", async () => {
    let captured: DelegationRequest | undefined;
    let resolveDelegate: (value: DelegationResult) => void = () => {};
    const delegate = (request: DelegationRequest) => {
      captured = request;
      return new Promise<DelegationResult>((resolve) => { resolveDelegate = resolve; });
    };

    const pending = runPersona({
      packageRoot: root,
      workspace: root,
      mode: "launch",
      idempotencyKey: "launch-key",
      delegate,
    }, "persona-team.engineering-manager", "Produce a bounded plan.");
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 1));

    expect(captured?.onLaunched).toBeInstanceOf(Function);
    expect(captured?.idempotencyKey).toBe("launch-key");
    captured?.onLaunched?.({
      requestId: "persona-req-1",
      ownerRunId: "persona-parent-persona-req-1",
      nodeId: "persona-team:persona-team.engineering-manager:launch-key",
      runId: "child-run-launch",
      cancel: () => {},
    });

    const result = await pending;
    expect(result.delegated).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.status).toBe("launched");
    expect(result.errors).toEqual([]);
    expect(result.runId).toBe("child-run-launch");
    expect(result.runKey).toBe("launch-key");
    expect(result.requestId).toBe("persona-req-1");
    expect(result.nodeId).toBe("persona-team:persona-team.engineering-manager:launch-key");

    resolveDelegate({ runId: "child-run-launch", ordinaryAccepted: false });
  });

  test("fails the launch when no acceptance ack arrives within the ack deadline", async () => {
    const result = await runPersona({
      packageRoot: root,
      workspace: root,
      mode: "launch",
      idempotencyKey: "stuck-key",
      launchAckTimeoutMs: 20,
      delegate: () => new Promise<DelegationResult>(() => {}),
    }, "persona-team.engineering-manager", "Produce a bounded plan.");

    expect(result.status).toBe("failed");
    expect(result.delegated).toBe(true);
    expect(result.runKey).toBe("stuck-key");
    expect(result.errors[0]).toContain("persona launch ack not received within 20ms");
  });

  test("a pre-ack delegate failure fails the launch instead of waiting for an ack", async () => {
    const result = await runPersona({
      packageRoot: root,
      workspace: root,
      mode: "launch",
      launchAckTimeoutMs: 5_000,
      delegate: async () => { throw new Error("persona launch preflight failed"); },
    }, "persona-team.engineering-manager", "Produce a bounded plan.");

    expect(result.status).toBe("failed");
    expect(result.errors[0]).toContain("pi-subagents delegation failed: persona launch preflight failed");
  });
});
