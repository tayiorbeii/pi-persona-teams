import { describe, expect, test } from "bun:test";
import { buildDelegationRequest, PERSONA_DELEGATION_RESPONSE_TIMEOUT_MS } from "../extensions/persona-parent.ts";

const identity = {
  requestId: "persona-1700000000000-1",
  ownerRunId: "persona-parent-persona-1700000000000-1",
  nodeId: "persona-team:persona-team.qa-lead:persona-1700000000000-1",
};

describe("delegation request wire format", () => {
  test("emitted delegation request carries no unsupported version field", () => {
    const request = buildDelegationRequest({
      ...identity,
      agent: "persona-team.qa-lead",
      task: "Produce a bounded test plan.",
      context: "fresh",
      workspace: "/tmp/persona-workspace",
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
    expect(request.result).toEqual({ kind: "text" });
  });

  test("parent response deadline default stays at the canonical ten-minute persona budget", () => {
    expect(PERSONA_DELEGATION_RESPONSE_TIMEOUT_MS).toBe(600_000);
  });
});
