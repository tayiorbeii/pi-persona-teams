import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { delegateThroughPiSubagents, idempotencyKeyFor } from "../extensions/persona-parent.ts";
import { runPersona, type DelegationRequest, type DelegationResult } from "../extensions/internal/persona-facade.ts";
import type { LaunchedAck } from "../extensions/internal/delegation-wait.ts";

const root = join(import.meta.dir, "..");

const REQUEST_EVENT = "test:persona:request";
const RESPONSE_EVENT = "test:persona:response";
const STARTED_EVENT = "test:persona:started";
const UPDATE_EVENT = "test:persona:update";
const CANCEL_EVENT = "test:persona:cancel";

const preflightInputs: Array<Record<string, unknown>> = [];
mock.module("pi-subagents/preflight", () => ({
  resolveSubagentLaunchContract: async (input: Record<string, unknown>) => {
    preflightInputs.push(input);
    return {
      ok: true,
      contract: {
        launchContractDigest: "preflight-digest",
        agent: { name: "persona-team.qa-lead", source: "package", filePath: "/pkg/agents/qa-lead.md" },
        tools: { configuredExtensions: ["/pkg/extensions/persona-child.ts"] },
      },
    };
  },
}));

mock.module("pi-subagents/delegation", () => ({
  SUBAGENT_DELEGATION_REQUEST_EVENT: REQUEST_EVENT,
  SUBAGENT_DELEGATION_RESPONSE_EVENT: RESPONSE_EVENT,
  SUBAGENT_DELEGATION_STARTED_EVENT: STARTED_EVENT,
  SUBAGENT_DELEGATION_UPDATE_EVENT: UPDATE_EVENT,
  SUBAGENT_DELEGATION_CANCEL_EVENT: CANCEL_EVENT,
}));

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

  requests(): Array<any> {
    return this.emitted.filter((entry) => entry.event === REQUEST_EVENT).map((entry) => entry.payload);
  }
}

function fakePi(bus: FakeDelegationBus) {
  return { events: bus };
}

function settleCompleted(bus: FakeDelegationBus, requestId: string, nodeId: string, runId: string): void {
  bus.emit(RESPONSE_EVENT, {
    requestId,
    ownerRunId: `persona-parent-${requestId}`,
    nodeId,
    status: "completed",
    runId,
    launchContractDigest: "preflight-digest",
    result: { kind: "text", text: `output-${runId}` },
  });
}

describe("delegation idempotency", () => {
  test("advisory and strict requests never share an in-flight run or diverge from preflight task text", async () => {
    const bus = new FakeDelegationBus();
    const request: DelegationRequest = { agent: "persona-team.qa-lead", task: "policy-isolation-task", context: "fresh", idempotencyKey: "policy-isolation-key" };
    const first = delegateThroughPiSubagents(fakePi(bus), "/tmp/w", request);
    const strict = delegateThroughPiSubagents(fakePi(bus), "/tmp/w", { ...request, verificationPolicy: "strict" });
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 1));
    const emitted = bus.requests();
    expect(emitted).toHaveLength(2);
    expect(emitted[0].task).toBe(request.task);
    expect(emitted[1].task).toContain("Strict verification requested");
    for (const entry of emitted) {
      expect(preflightInputs.some((input) => input.task === entry.task)).toBe(true);
      settleCompleted(bus, entry.requestId, entry.nodeId, `child-${entry.requestId}`);
    }
    const [advice, evidence] = await Promise.all([first, strict]);
    expect(advice.runId).not.toBe(evidence.runId);
    expect(advice.executionStatus).toBe("completed");
    expect(evidence.executionStatus).toBe("completed");
  });

  test("explicit runKey wins; otherwise the key is a stable digest of agent and task", () => {
    expect(idempotencyKeyFor({ agent: "persona-team.qa-lead", task: "task-a", idempotencyKey: "explicit" })).toBe("explicit");
    const first = idempotencyKeyFor({ agent: "persona-team.qa-lead", task: "task-a" });
    const second = idempotencyKeyFor({ agent: "persona-team.qa-lead", task: "task-a" });
    const otherTask = idempotencyKeyFor({ agent: "persona-team.qa-lead", task: "task-b" });
    expect(first).toBe(second);
    expect(first).not.toBe(otherTask);
    expect(first).toMatch(/^[0-9a-f]{24}$/);
  });

  test("concurrent identical runs share one delegation instead of launching duplicate children", async () => {
    const bus = new FakeDelegationBus();
    const request: DelegationRequest = { agent: "persona-team.qa-lead", task: "shared task", context: "fresh" };
    const first = delegateThroughPiSubagents(fakePi(bus), "/tmp/w", request);
    const second = delegateThroughPiSubagents(fakePi(bus), "/tmp/w", request);

    await new Promise((resolveTimer) => setTimeout(resolveTimer, 1));
    expect(bus.requests().length).toBe(1);

    const emitted = bus.requests()[0];
    settleCompleted(bus, emitted.requestId, emitted.nodeId, "child-run-dedupe");

    const [resultA, resultB] = await Promise.all([first, second]) as [DelegationResult, DelegationResult];
    expect(resultA.runId).toBe("child-run-dedupe");
    expect(resultB).toBe(resultA);
  });

  test("a retry with the same runKey attaches to the in-flight run and receives its launched ack", async () => {
    const bus = new FakeDelegationBus();
    const acks: Array<LaunchedAck> = [];
    const first = delegateThroughPiSubagents(fakePi(bus), "/tmp/w", { agent: "persona-team.qa-lead", task: "task one", context: "fresh", idempotencyKey: "retry-key" });
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 1));
    // The bridge emits started synchronously while processing the request, so
    // the accepted attempt has a recorded ack before any realistic retry.
    const startedRequest = bus.requests()[0];
    bus.emit(STARTED_EVENT, { requestId: startedRequest.requestId, ownerRunId: startedRequest.ownerRunId, nodeId: startedRequest.nodeId });

    const retry = delegateThroughPiSubagents(fakePi(bus), "/tmp/w", {
      agent: "persona-team.qa-lead",
      task: "task one",
      context: "fresh",
      idempotencyKey: "retry-key",
      onLaunched: (ack) => acks.push(ack),
    });
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 1));
    expect(bus.requests().length).toBe(1);
    expect(acks.length).toBe(1);
    expect(acks[0].cancel).toBeInstanceOf(Function);

    const emitted = bus.requests()[0];
    bus.emit(UPDATE_EVENT, { requestId: emitted.requestId, ownerRunId: emitted.ownerRunId, nodeId: emitted.nodeId, runId: "child-run-attach" });
    expect(acks[0].runId).toBe("child-run-attach");

    settleCompleted(bus, emitted.requestId, emitted.nodeId, "child-run-attach");
    const [resultA, resultB] = await Promise.all([first, retry]) as [DelegationResult, DelegationResult];
    expect(resultA.runId).toBe("child-run-attach");
    expect(resultB).toBe(resultA);
  });

  test("an intentional re-run after terminal completion starts a fresh delegation", async () => {
    const bus = new FakeDelegationBus();
    const request: DelegationRequest = { agent: "persona-team.qa-lead", task: "finished task", context: "fresh" };
    const first = delegateThroughPiSubagents(fakePi(bus), "/tmp/w", request);
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 1));
    const emitted = bus.requests()[0];
    settleCompleted(bus, emitted.requestId, emitted.nodeId, "child-run-first");
    await first;

    const second = delegateThroughPiSubagents(fakePi(bus), "/tmp/w", request);
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 1));
    expect(bus.requests().length).toBe(2);
    const secondEmitted = bus.requests()[1];
    expect(secondEmitted.requestId).not.toBe(emitted.requestId);
    settleCompleted(bus, secondEmitted.requestId, secondEmitted.nodeId, "child-run-second");
    const result = await second;
    expect(result.runId).toBe("child-run-second");
  });

  test("runPersona launch mode returns a handle and a later wait attaches to the same child", async () => {
    const bus = new FakeDelegationBus();
    const delegate = (request: DelegationRequest) => delegateThroughPiSubagents(fakePi(bus), root, request);

    const launch = runPersona({
      packageRoot: root,
      workspace: root,
      mode: "launch",
      idempotencyKey: "e2e-launch",
      delegate,
    }, "persona-team.qa-lead", "e2e launch task");
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 1));
    const emitted = bus.requests()[0];
    bus.emit(STARTED_EVENT, { requestId: emitted.requestId, ownerRunId: emitted.ownerRunId, nodeId: emitted.nodeId });

    const launched = await launch;
    expect(launched.status).toBe("launched");
    expect(launched.runKey).toBe("e2e-launch");
    expect(launched.requestId).toBe(emitted.requestId);

    const wait = runPersona({
      packageRoot: root,
      workspace: root,
      idempotencyKey: "e2e-launch",
      delegate,
    }, "persona-team.qa-lead", "a different task text still attaches via runKey");
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 1));
    expect(bus.requests().length).toBe(1);

    bus.emit(UPDATE_EVENT, { requestId: emitted.requestId, ownerRunId: emitted.ownerRunId, nodeId: emitted.nodeId, runId: "child-run-e2e" });
    settleCompleted(bus, emitted.requestId, emitted.nodeId, "child-run-e2e");
    const waitResult = await wait;
    expect(waitResult.delegated).toBe(true);
    expect(waitResult.output).toBe("output-child-run-e2e");
  });
});
