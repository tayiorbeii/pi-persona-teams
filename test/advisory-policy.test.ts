import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { createPersonaChildRuntimeFromEnvironment } from "../extensions/persona-child.ts";
import { waitForDelegationResponse } from "../extensions/internal/delegation-wait.ts";
import { runPersona } from "../extensions/internal/persona-facade.ts";
import { ledgerPersistencePath } from "../extensions/internal/ledger.ts";
import type { PersonaAttestation } from "../extensions/internal/attestation.ts";

const root = join(import.meta.dir, "..");
const runtimeName = "persona-team.staff-reviewer";
const identity = { requestId: "policy-request", ownerRunId: "policy-owner", nodeId: "policy-node" };

function wait(verificationPolicy: "advisory" | "strict") {
  const emitter = new EventEmitter();
  const promise = waitForDelegationResponse({
    bus: {
      on(event, handler) { emitter.on(event, handler); return () => { emitter.off(event, handler); }; },
      emit(event, payload) { emitter.emit(event, payload); },
    },
    eventNames: { request: "request", response: "response" },
    identity,
    delegationRequest: {},
    expectedLaunchContractDigest: "expected",
    verificationPolicy,
    waitMs: 1000,
  });
  return { promise, respond: (payload: Record<string, unknown>) => emitter.emit("response", { ...identity, ...payload }) };
}

describe("expertise-first verification", () => {
  for (const launchContractDigest of [undefined, "different"]) {
    test(`advisory preserves completed output for digest ${launchContractDigest}`, async () => {
      const { promise, respond } = wait("advisory");
      respond({ status: "completed", runId: "policy-child", launchContractDigest, result: { kind: "text", text: "Useful review" } });
      const result = await promise;
      expect(result.output).toBe("Useful review");
      expect(result.executionStatus).toBe("completed");
      expect(result.warnings).toHaveLength(1);
    });

    test(`strict rejects completed output for digest ${launchContractDigest}`, async () => {
      const { promise, respond } = wait("strict");
      respond({ status: "completed", runId: "policy-child", launchContractDigest });
      await expect(promise).rejects.toThrow("launchContractDigest");
    });
  }

  for (const status of ["failed", "cancelled", "timed_out"]) {
    test(`advisory does not turn ${status} into a completed review`, async () => {
      const { promise, respond } = wait("advisory");
      respond({ status, runId: "policy-child" });
      await expect(promise).rejects.toThrow(status);
    });
  }

  test("advisory ignores foreign response identities and requires a child run ID", async () => {
    const { promise, respond } = wait("advisory");
    respond({ nodeId: "foreign", status: "completed", runId: "foreign-child", result: { kind: "text", text: "Wrong output" } });
    respond({ status: "completed", runId: "" });
    await expect(promise).rejects.toThrow("child run ID");
  });

  test("environment-created reviewer works without receipts but cannot mutate candidate files", () => {
    const workspace = mkdtempSync(join(tmpdir(), "persona-advisory-"));
    const childIdentity = { runtimeName, runId: `advisory-${workspace.split("/").pop()}`, childIndex: 0 };
    try {
      const child = createPersonaChildRuntimeFromEnvironment({
        workspace,
        attestationDir: join(workspace, "attestations"),
        environment: { PI_SUBAGENT_CHILD_AGENT: runtimeName, PI_SUBAGENT_RUN_ID: childIdentity.runId, PI_SUBAGENT_CHILD_INDEX: "0" },
      });
      expect(child.toolCall("read", { path: join(workspace, "README.md") }).allowed).toBe(true);
      expect(child.status().requiredMethods.every((method) => !method.activated)).toBe(true);
      expect(child.toolCall("edit", { path: join(workspace, "src.ts"), oldText: "a", newText: "b" }).allowed).toBe(false);
      expect(child.toolCall("bash", { command: "rm -rf src" }).allowed).toBe(false);
      expect(child.toolCall("subagent", { agent: "worker" }).allowed).toBe(false);
      expect(child.attestation()).toBeUndefined();
    } finally {
      rmSync(ledgerPersistencePath(childIdentity), { force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  for (const patch of [
    { runtimeName: "persona-team.qa-lead" },
    { role: "qa-lead" },
    { runId: "foreign" },
    { childIndex: 7 },
  ]) {
    test(`advisory rejects foreign attestation identity before checking missing digest: ${JSON.stringify(patch)}`, async () => {
      const attestation = { runtimeName, role: "staff-reviewer", runId: "current", childIndex: 0, ...patch } as PersonaAttestation;
      const result = await runPersona({
        packageRoot: root,
        workspace: root,
        delegate: async () => ({ runId: "current", childIndex: 0, attestation, output: "Do not silently trust this", ordinaryAccepted: true }),
      }, runtimeName, "Review the candidate.");
      expect(result.status).toBe("failed");
      expect(result.errors.some((error) => error.includes("mismatch"))).toBe(true);
      expect(result.accepted).toBe(false);
      expect(result.personaAccepted).toBe(false);
      expect(result.output).toBeUndefined();
    });
  }

  test("advisory cannot bypass independent-run identity by omitting attestation", async () => {
    const result = await runPersona({
      packageRoot: root,
      workspace: root,
      independentFrom: { runtimeName, runId: "reused" },
      delegate: async () => ({ runId: "reused", output: "Reused advice" }),
    }, runtimeName, "Review independently.");
    expect(result.status).toBe("failed");
    expect(result.errors).toContain("independent run identity matches the earlier run");
    expect(result.output).toBeUndefined();
  });
});
