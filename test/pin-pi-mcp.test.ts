import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planPin, serverIdentity } from "../scripts/lib/pin-pi-mcp.ts";

const global = {
  "context-mode": { command: "node", args: ["/home/u/.pi/extensions/context-mode/start.mjs"], lifecycle: "keep-alive", directTools: ["ctx_execute"] },
  jcodemunch: { command: "jcodemunch-mcp", args: [], lifecycle: "keep-alive" },
};
const always = { isPiProjectRoot: () => true, overrideIsLocalOnly: () => true };

function project(servers: Record<string, unknown>, override?: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "pin-pi-mcp-"));
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: servers }));
  if (override) {
    mkdirSync(join(dir, ".pi"));
    writeFileSync(join(dir, ".pi", "mcp.json"), JSON.stringify(override));
  }
  return join(dir, ".mcp.json");
}

test("identity ignores lifecycle-only fields and key order, as the configHash does", () => {
  expect(serverIdentity({ command: "x", args: [], lifecycle: "lazy", type: "stdio" })).toBe(serverIdentity({ args: [], command: "x", idleTimeout: 20 }));
  expect(serverIdentity({ command: "x" })).not.toBe(serverIdentity({ command: "/wrapper/x" }));
});

test("pins only divergent servers and preserves the rest of an existing override", () => {
  const file = project(
    { "context-mode": { type: "stdio", command: "/u/.paperclip/bin/context-mode", args: [] }, jcodemunch: { command: "jcodemunch-mcp", args: [] }, seer: { url: "https://x" } },
    { settings: { toolPrefix: "none" }, mcpServers: { seer: { url: "https://y" } } },
  );
  const plan = planPin(file, global, ["context-mode", "jcodemunch", "jdocmunch"], always);
  expect(plan.status).toBe("pinned");
  expect(plan.divergent).toEqual(["context-mode"]);
  expect(plan.next).toEqual({ settings: { toolPrefix: "none" }, mcpServers: { seer: { url: "https://y" }, "context-mode": global["context-mode"] } });
});

test("an existing aligned override counts as aligned", () => {
  const file = project({ "context-mode": { command: "/wrapper" } }, { mcpServers: { "context-mode": global["context-mode"] } });
  expect(planPin(file, global, ["context-mode"], always).status).toBe("already-aligned");
});

test("never creates .pi/ outside an existing pi project root, and never writes a tracked override", () => {
  const file = project({ jcodemunch: { command: "/wrapper/jcodemunch-mcp" } });
  expect(planPin(file, global, ["jcodemunch"], { ...always, isPiProjectRoot: () => false }).status).toBe("not-pi-root");
  expect(planPin(file, global, ["jcodemunch"], { ...always, overrideIsLocalOnly: () => false }).status).toBe("override-not-ignored");
});
