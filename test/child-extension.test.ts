import { expect, test } from "bun:test";
import { rmSync } from "node:fs";
import personaChildExtension from "../extensions/persona-child.ts";
import { ledgerPersistencePath } from "../extensions/internal/ledger.ts";

interface RegisteredTool {
  name: string;
  execute: (toolCallId: string, params: unknown) => Promise<{ details?: { ok?: boolean; message?: string; status?: { toolVisibility?: { available: string[] }; providers?: { contextMode?: { availability: string }; jcodemunch?: { availability: string } } } } }> | { details?: { ok?: boolean; message?: string; status?: { toolVisibility?: { available: string[] }; providers?: { contextMode?: { availability: string }; jcodemunch?: { availability: string } } } } };
}

interface FakePi {
  getAllTools: () => Array<{ name: string; description: string; source?: string; provenance?: string }>;
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
      // Match pi-mcp-adapter direct tools: registry names are present, but
      // registerTool descriptors do not carry source/provenance metadata.
      return [
        { name: "context_mode_ctx_search", description: "search" },
        { name: "jcodemunch_search_symbols", description: "search" },
        { name: "fffind", description: "fuzzy path search" },
        { name: "ffgrep", description: "indexed content search" },
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
  const identity = { runtimeName: "persona-team.engineering-manager", runId: "child-extension-test", childIndex: 0 };
  rmSync(ledgerPersistencePath(identity), { force: true });
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
    expect(result.details?.ok, result.details?.message).toBe(true);
    expect(result.details?.status?.toolVisibility?.available).toEqual(expect.arrayContaining([
      "context_mode_ctx_search",
      "jcodemunch_search_symbols",
      "fffind",
      "ffgrep",
    ]));
    expect(result.details?.status?.toolVisibility?.available).toHaveLength(4);
    expect(result.details?.status?.providers?.contextMode?.availability).toBe("available");
    expect(result.details?.status?.providers?.jcodemunch?.availability).toBe("available");
  } finally {
    rmSync(ledgerPersistencePath(identity), { force: true });
    if (original.childAgent === undefined) delete process.env.PI_SUBAGENT_CHILD_AGENT;
    else process.env.PI_SUBAGENT_CHILD_AGENT = original.childAgent;
    if (original.runId === undefined) delete process.env.PI_SUBAGENT_RUN_ID;
    else process.env.PI_SUBAGENT_RUN_ID = original.runId;
    if (original.childIndex === undefined) delete process.env.PI_SUBAGENT_CHILD_INDEX;
    else process.env.PI_SUBAGENT_CHILD_INDEX = original.childIndex;
  }
});
