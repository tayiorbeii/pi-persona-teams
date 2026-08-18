import { expect, test } from "bun:test";
import personaChildExtension from "../extensions/persona-child.ts";

interface RegisteredTool {
  name: string;
  execute: (toolCallId: string, params: unknown) => Promise<{ details?: { ok?: boolean; message?: string } }> | { details?: { ok?: boolean; message?: string } };
}

interface FakePi {
  getAllTools: () => Array<{ name: string; description: string; source: string; provenance: string }>;
  registerTool: (tool: RegisteredTool) => void;
  on: (event: string, handler: (payload: unknown) => unknown) => void;
}

function buildFakePi(): {
  pi: FakePi;
  getAllToolsCalls: () => number;
  setBound: () => void;
  registeredTools: RegisteredTool[];
  handlers: Map<string, (payload: unknown) => unknown>;
} {
  let bound = false;
  let getAllToolsCalls = 0;
  const registeredTools: RegisteredTool[] = [];
  const handlers = new Map<string, (payload: unknown) => unknown>();
  const pi: FakePi = {
    getAllTools() {
      getAllToolsCalls += 1;
      if (!bound) {
        // Reproduce the Pi pre-bind stub that previously poisoned admission.
        throw new Error("Extension runtime not initialized. Action methods cannot be called during extension loading.");
      }
      return [
        { name: "ctx_search", description: "search", source: "context-mode", provenance: "mcp:context-mode" },
        { name: "jcodemunch_search_symbols", description: "search", source: "jcodemunch", provenance: "mcp:jcodemunch" },
      ];
    },
    registerTool(tool: RegisteredTool) {
      registeredTools.push(tool);
    },
    on(event: string, handler: (payload: unknown) => unknown) {
      handlers.set(event, handler);
    },
  };
  return { pi, getAllToolsCalls: () => getAllToolsCalls, setBound: () => { bound = true; }, registeredTools, handlers };
}

test("child extension defers tool discovery until session_start instead of calling getAllTools during loading", async () => {
  const original = {
    childAgent: process.env.PI_SUBAGENT_CHILD_AGENT,
    runId: process.env.PI_SUBAGENT_RUN_ID,
    childIndex: process.env.PI_SUBAGENT_CHILD_INDEX,
  };
  process.env.PI_SUBAGENT_CHILD_AGENT = "persona-team.engineering-manager";
  process.env.PI_SUBAGENT_RUN_ID = "child-extension-test";
  process.env.PI_SUBAGENT_CHILD_INDEX = "0";
  try {
    const { pi, getAllToolsCalls, setBound, registeredTools, handlers } = buildFakePi();

    // Loading the extension must not touch the (still-stubbed) action runtime.
    personaChildExtension(pi as never);

    expect(getAllToolsCalls()).toBe(0);
    expect(registeredTools.some((tool) => tool.name === "persona_contract")).toBe(true);
    const sessionStart = handlers.get("session_start");
    expect(sessionStart).toBeDefined();

    // After bindCore(), session_start fires and discovers the real tool registry.
    setBound();
    await sessionStart!({});
    expect(getAllToolsCalls()).toBe(1);

    // The admission tool is no longer pinned to a spurious startup error.
    const contract = registeredTools.find((tool) => tool.name === "persona_contract")!;
    const result = await contract.execute("call-1", { action: "status" });
    expect(result.details?.ok).toBe(true);
  } finally {
    if (original.childAgent === undefined) delete process.env.PI_SUBAGENT_CHILD_AGENT;
    else process.env.PI_SUBAGENT_CHILD_AGENT = original.childAgent;
    if (original.runId === undefined) delete process.env.PI_SUBAGENT_RUN_ID;
    else process.env.PI_SUBAGENT_RUN_ID = original.runId;
    if (original.childIndex === undefined) delete process.env.PI_SUBAGENT_CHILD_INDEX;
    else process.env.PI_SUBAGENT_CHILD_INDEX = original.childIndex;
  }
});
