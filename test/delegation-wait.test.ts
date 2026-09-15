import { describe, expect, test } from "bun:test";
import { buildDelegationRequest, PERSONA_DELEGATION_RESPONSE_TIMEOUT_MS, resolveChildTimeoutMs, resolveWaitMs } from "../extensions/persona-parent.ts";
import { waitForDelegationResponse, type DelegationWaitEventNames, type LaunchedAck } from "../extensions/internal/delegation-wait.ts";
import { runPersona } from "../extensions/internal/persona-facade.ts";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const identity = {
  requestId: "persona-1700000000000-1",
  ownerRunId: "persona-parent-persona-1700000000000-1",
  nodeId: "persona-team:persona-team.qa-lead:persona-1700000000000-1",
};

class FakeDelegationBus {
  handlers = new Map<string, Array<(payload: any) => void>>();
  emitted: Array<{ event: string; payload: any }> = [];

  on(event: string, handler: (payload: any) => void): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return () => {
      this.handlers.set(event, (this.handlers.get(event) ?? []).filter((candidate) => candidate !== handler));
    };
  }

  emit(event: string, payload: any): void {
    this.emitted.push({ event, payload });
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(payload);
  }

  emittedEvents(eventName: string): Array<any> {
    return this.emitted.filter((entry) => entry.event === eventName).map((entry) => entry.payload);
  }
}

const fullEventNames: DelegationWaitEventNames = {
  request: "prompt-template:subagent:request",
  response: "prompt-template:subagent:response",
  started: "prompt-template:subagent:started",
  update: "prompt-template:subagent:update",
  cancel: "prompt-template:subagent:cancel",
};

function startWaiter(bus: FakeDelegationBus, overrides: Partial<Parameters<typeof waitForDelegationResponse>[0]> = {}) {
  const waits: Array<LaunchedAck> = [];
  const pending = waitForDelegationResponse({
    bus,
    eventNames: fullEventNames,
    identity,
    delegationRequest: buildDelegationRequest({ ...identity, agent: "persona-team.qa-lead", task: "task", context: "fresh", workspace: "/tmp/w" }),
    expectedLaunchContractDigest: "expected-digest",
    waitMs: 5_000,
    onLaunched: (ack) => waits.push(ack),
    ...overrides,
  });
  return { pending, waits };
}

describe("delegation request wire format", () => {
  test("emitted delegation request carries no unsupported version field", () => {
    const request = buildDelegationRequest({
      ...identity,
      agent: "persona-team.qa-lead",
      task: "Produce a bounded test plan.",
      context: "fresh",
      workspace: "/tmp/persona-workspace",
      timeoutMs: 570_000,
    });

    // pi-subagents bridges reject unknown request fields (delegation-request.ts
    // supportedFields) and never echo a version field in responses, so a
    // `version` key would turn every delegation into a silent invalid_request
    // that the response correlation filter cannot match.
    expect("version" in request).toBe(false);
    expect(request.requestId).toBe(identity.requestId);
    expect(request.ownerRunId).toBe(identity.ownerRunId);
    expect(request.nodeId).toBe(identity.nodeId);
    expect(request.agent).toBe("persona-team.qa-lead");
    expect(request.context).toBe("fresh");
    expect(request.cwd).toBe("/tmp/persona-workspace");
    expect(request.artifacts).toBe(true);
    expect(request.timeoutMs).toBe(570_000);
    expect(request.result).toEqual({ kind: "text" });
  });

  test("parent response deadline default stays at the canonical ten-minute persona budget", () => {
    expect(PERSONA_DELEGATION_RESPONSE_TIMEOUT_MS).toBe(600_000);
  });
});

describe("per-call delegation deadline resolution", () => {
  test("defaults to the 600s parent budget and keeps the child strictly inside it", () => {
    expect(resolveWaitMs(undefined)).toBe(600_000);
    expect(resolveChildTimeoutMs(resolveWaitMs(undefined))).toBe(570_000);
  });

  test("honors a per-call override for both parent wait and child run bound", () => {
    const waitMs = resolveWaitMs(45_000);
    expect(waitMs).toBe(45_000);
    expect(resolveChildTimeoutMs(waitMs)).toBe(15_000);
  });

  test("clamps per-call values into the bridge-validated range", () => {
    expect(resolveWaitMs(1)).toBe(1_000);
    expect(resolveWaitMs(Number.MAX_SAFE_INTEGER)).toBe(2_147_483_647);
    expect(resolveChildTimeoutMs(1_000)).toBe(1_000);
    expect(resolveChildTimeoutMs(2_147_483_647)).toBe(2_147_453_647);
  });

  test("facade forwards the per-call deadline into the delegate request", async () => {
    const seen: Array<unknown> = [];
    const result = await runPersona({
      packageRoot: root,
      workspace: root,
      responseTimeoutMs: 123_456,
      delegate: async (request) => {
        seen.push(request);
        return { runId: "deadline-probe", ordinaryAccepted: false };
      },
    }, "persona-team.engineering-manager", "Produce a bounded plan.");

    expect(result.delegated).toBe(true);
    expect(seen.length).toBe(1);
    expect((seen[0] as { responseTimeoutMs?: number }).responseTimeoutMs).toBe(123_456);
  });
});

describe("delegation response waiter", () => {
  test("surfaces a launched ack at started and fills its runId in live from the first update", async () => {
    const bus = new FakeDelegationBus();
    const { pending, waits } = startWaiter(bus);
    const observed: Array<string> = [];
    pending.then(
      () => observed.push("resolved"),
      () => observed.push("rejected"),
    );

    bus.emit(fullEventNames.started, { ...identity });
    expect(waits.length).toBe(1);
    expect(waits[0].runId).toBeUndefined();
    expect(waits[0].requestId).toBe(identity.requestId);
    expect(typeof waits[0].cancel).toBe("function");

    bus.emit(fullEventNames.update, { ...identity, runId: "child-run-1" });
    expect(waits.length).toBe(1);
    expect(waits[0].runId).toBe("child-run-1");
    expect(observed).toEqual([]);

    bus.emit(fullEventNames.response, { ...identity, status: "completed", runId: "child-run-1", launchContractDigest: "expected-digest", result: { kind: "text", text: "done" } });
    const success = await pending;
    expect(success).toEqual({ runId: "child-run-1", launchContractDigest: "expected-digest", output: "done" });
    expect(observed).toEqual(["resolved"]);
  });

  test("delivers exactly one launched ack when the first update carries the runId", async () => {
    const bus = new FakeDelegationBus();
    const { pending, waits } = startWaiter(bus, { onLaunched: undefined });
    const ackWaits: Array<LaunchedAck> = [];
    const promise = waitForDelegationResponse({
      bus,
      eventNames: fullEventNames,
      identity,
      delegationRequest: {},
      expectedLaunchContractDigest: "expected-digest",
      waitMs: 5_000,
      onLaunched: (ack) => ackWaits.push(ack),
    });

    bus.emit(fullEventNames.update, { ...identity, runId: "child-run-2" });
    expect(ackWaits.length).toBe(1);
    expect(ackWaits[0].runId).toBe("child-run-2");

    bus.emit(fullEventNames.response, { ...identity, status: "completed", runId: "child-run-2", launchContractDigest: "expected-digest" });
    await promise;
    expect(ackWaits.length).toBe(1);
  });

  test("terminal completion also counts as launch evidence for late consumers", async () => {
    const bus = new FakeDelegationBus();
    const ackWaits: Array<LaunchedAck> = [];
    const promise = waitForDelegationResponse({
      bus,
      eventNames: fullEventNames,
      identity,
      delegationRequest: {},
      expectedLaunchContractDigest: "expected-digest",
      waitMs: 5_000,
      onLaunched: (ack) => ackWaits.push(ack),
    });

    bus.emit(fullEventNames.response, { ...identity, status: "completed", runId: "child-run-3", launchContractDigest: "expected-digest" });
    const success = await promise;
    expect(success.runId).toBe("child-run-3");
    expect(ackWaits.length).toBe(1);
  });

  test("timeout emits a bridge cancel for the attempt identity and attaches the captured runId to the error", async () => {
    const bus = new FakeDelegationBus();
    const { pending, waits } = startWaiter(bus, { waitMs: 15 });
    bus.emit(fullEventNames.update, { ...identity, runId: "child-run-4" });
    expect(waits[0].runId).toBe("child-run-4");

    const error = await pending.then(
      () => { throw new Error("waiter should have timed out"); },
      (caught: Error) => caught,
    );
    expect(error.message).toContain("timed out waiting for pi-subagents delegation response after 15ms");
    expect(error.message).toContain("child runId child-run-4");
    const fields = error as Error & { runId?: string; cancelled?: boolean; timeoutMs?: number; requestId?: string; nodeId?: string };
    expect(fields.runId).toBe("child-run-4");
    expect(fields.cancelled).toBe(true);
    expect(fields.timeoutMs).toBe(15);
    expect(fields.requestId).toBe(identity.requestId);
    expect(fields.nodeId).toBe(identity.nodeId);

    const cancels = bus.emittedEvents(fullEventNames.cancel);
    expect(cancels.length).toBe(1);
    expect(cancels[0]).toEqual({ requestId: identity.requestId, ownerRunId: identity.ownerRunId, nodeId: identity.nodeId });
  });

  test("timeout without any runId update still cancels and reports that no runId was captured", async () => {
    const bus = new FakeDelegationBus();
    const { pending } = startWaiter(bus, { waitMs: 10 });
    const error = await pending.then(
      () => { throw new Error("waiter should have timed out"); },
      (caught: Error) => caught,
    );
    expect(error.message).toContain("child had not reported a runId yet");
    expect((error as { runId?: string }).runId).toBeUndefined();
    expect((error as { cancelled?: boolean }).cancelled).toBe(true);
    expect(bus.emittedEvents(fullEventNames.cancel).length).toBe(1);
  });

  test("non-completed terminal statuses reject with the bridge status and runId attached", async () => {
    const bus = new FakeDelegationBus();
    const { pending } = startWaiter(bus);
    bus.emit(fullEventNames.response, { ...identity, status: "timed_out", runId: "child-run-5", error: "child exceeded timeoutMs" });
    const error = await pending.then(
      () => { throw new Error("waiter should have rejected"); },
      (caught: Error) => caught,
    );
    expect(error.message).toContain("pi-subagents delegation timed_out: child exceeded timeoutMs");
    expect((error as { status?: string }).status).toBe("timed_out");
    expect((error as { runId?: string }).runId).toBe("child-run-5");
  });

  test("an invalid_request terminal fails fast even when it omits ownerRunId and nodeId", async () => {
    const bus = new FakeDelegationBus();
    const { pending } = startWaiter(bus);
    bus.emit(fullEventNames.response, { requestId: identity.requestId, status: "invalid_request", error: "Unsupported delegation field: version." });
    const error = await pending.then(
      () => { throw new Error("waiter should have rejected"); },
      (caught: Error) => caught,
    );
    expect(error.message).toContain("invalid_request: Unsupported delegation field: version.");
    expect((error as { status?: string }).status).toBe("invalid_request");
  });

  test("a launchContractDigest mismatch rejects instead of resolving", async () => {
    const bus = new FakeDelegationBus();
    const { pending } = startWaiter(bus);
    bus.emit(fullEventNames.response, { ...identity, status: "completed", runId: "child-run-6", launchContractDigest: "wrong-digest" });
    const error = await pending.then(
      () => { throw new Error("waiter should have rejected"); },
      (caught: Error) => caught,
    );
    expect(error.message).toContain("does not match the immutable preflight contract");
  });

  test("degrades gracefully when the bridge does not export started/update/cancel events", async () => {
    const bus = new FakeDelegationBus();
    const ackWaits: Array<LaunchedAck> = [];
    const pending = waitForDelegationResponse({
      bus,
      eventNames: { request: fullEventNames.request, response: fullEventNames.response },
      identity,
      delegationRequest: {},
      expectedLaunchContractDigest: "expected-digest",
      waitMs: 10,
      onLaunched: (ack) => ackWaits.push(ack),
    });
    const error = await pending.then(
      () => { throw new Error("waiter should have timed out"); },
      (caught: Error) => caught,
    );
    expect((error as { cancelled?: boolean }).cancelled).toBe(true);
    expect(ackWaits.length).toBe(0);
    expect(bus.emittedEvents(fullEventNames.cancel).length).toBe(0);
    expect(bus.emittedEvents(fullEventNames.request).length).toBe(1);
  });

  test("a failed request emission rejects immediately instead of waiting", async () => {
    const bus = new FakeDelegationBus();
    const failingBus = new Proxy(bus, {
      get(target, property, receiver) {
        if (property === "emit") {
          return (event: string, payload: unknown) => {
            if (event === fullEventNames.request) throw new Error("event bus is closed");
            return target.emit(event, payload);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const { pending } = startWaiter(failingBus as unknown as FakeDelegationBus);
    const error = await pending.then(
      () => { throw new Error("waiter should have rejected"); },
      (caught: Error) => caught,
    );
    expect(error.message).toBe("event bus is closed");
  });

  test("responses for other request ids are ignored until ours arrives", async () => {
    const bus = new FakeDelegationBus();
    const { pending } = startWaiter(bus);
    bus.emit(fullEventNames.response, { ...identity, requestId: "persona-other", status: "failed" });
    bus.emit(fullEventNames.response, { ...identity, status: "completed", runId: "child-run-7", launchContractDigest: "expected-digest" });
    const success = await pending;
    expect(success.runId).toBe("child-run-7");
  });
});

describe("facade timeout enrichment", () => {
  test("surfaces the child runId and timedOut flag when the delegation wait gives up", async () => {
    const timeoutError = Object.assign(
      new Error("timed out waiting for pi-subagents delegation response after 600000ms (child runId child-run-8; cancellation requested)"),
      { runId: "child-run-8", cancelled: true, timeoutMs: 600_000 },
    );
    const result = await runPersona({
      packageRoot: root,
      workspace: root,
      delegate: async () => { throw timeoutError; },
    }, "persona-team.engineering-manager", "Produce a bounded plan.");

    expect(result.accepted).toBe(false);
    expect(result.delegated).toBe(true);
    expect(result.errors[0]).toContain("pi-subagents delegation failed: timed out waiting");
    expect(result.runId).toBe("child-run-8");
    expect(result.timedOut).toBe(true);
  });
});
