// Two projects define server "srv" differently and share one agent dir (one mcp-cache.json).
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ADAPTER_DIR / SUBAGENTS_DIR: patched package checkouts; ORIGINAL_SUBAGENTS_DIR: an unpatched pi-subagents.
const ADAPTER_DIR = process.env.ADAPTER_DIR!;
const SUBAGENTS_DIR = process.env.SUBAGENTS_DIR!;
const ORIGINAL_SUBAGENTS_DIR = process.env.ORIGINAL_SUBAGENTS_DIR ?? `${process.env.HOME}/.pi/agent/npm/node_modules/pi-subagents`;
const agentDir = mkdtempSync(join(tmpdir(), "agent-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
const globalDef = { command: "srv-mcp", args: [] };
const projectDef = { command: "/wrapper/srv-mcp", args: [] };
writeFileSync(join(agentDir, "mcp.json"), JSON.stringify({ mcpServers: { srv: globalDef } }));
const globalProject = mkdtempSync(join(tmpdir(), "proj-global-"));
const otherProject = mkdtempSync(join(tmpdir(), "proj-other-"));
mkdirSync(join(otherProject, ".pi"));
writeFileSync(join(otherProject, ".mcp.json"), JSON.stringify({ mcpServers: { srv: projectDef } }));

const adapter = await import(`${ADAPTER_DIR}/metadata-cache.ts`);
const patched = await import(`${SUBAGENTS_DIR}/src/runs/shared/mcp-direct-tool-allowlist.ts`);
const original = await import(`${ORIGINAL_SUBAGENTS_DIR}/src/runs/shared/mcp-direct-tool-allowlist.ts`);

function writeAs(definition: Record<string, unknown>) {
  adapter.saveMetadataCache({ version: 1, servers: { srv: { configHash: adapter.computeServerHash(definition), tools: [{ name: "lookup" }], resources: [], prompts: [], cachedAt: Date.now() } } });
}
const unresolved = (mod: any, cwd: string) => mod.resolveMcpDirectToolResolution(["srv/lookup"], cwd).unresolvedSelectors;

test("bug: last writer wins, so the other project's selectors stop resolving", () => {
  writeAs(globalDef);
  writeAs(projectDef); // a session in the other project connects last
  expect(unresolved(original, globalProject)).toEqual(["srv/lookup"]);
  expect(unresolved(original, otherProject)).toEqual([]);
});

test("fix: both projects resolve from their own config's variant", () => {
  writeAs(globalDef);
  writeAs(projectDef);
  expect(unresolved(patched, globalProject)).toEqual([]);
  expect(unresolved(patched, otherProject)).toEqual([]);
  writeAs(globalDef); // and in the other order
  expect(unresolved(patched, globalProject)).toEqual([]);
  expect(unresolved(patched, otherProject)).toEqual([]);
});

test("old readers still see a normal last-writer-wins servers map", () => {
  const raw = JSON.parse(require("node:fs").readFileSync(join(agentDir, "mcp-cache.json"), "utf8"));
  expect(raw.servers.srv.configHash).toBe(adapter.computeServerHash(globalDef));
  expect(Object.keys(raw.variants.srv).sort()).toEqual([adapter.computeServerHash(globalDef), adapter.computeServerHash(projectDef)].sort());
});

test("variants are capped per server", () => {
  for (let i = 0; i < adapter.MAX_CACHE_VARIANTS_PER_SERVER + 3; i++) writeAs({ command: `srv-${i}` });
  const raw = JSON.parse(require("node:fs").readFileSync(join(agentDir, "mcp-cache.json"), "utf8"));
  expect(Object.keys(raw.variants.srv).length).toBe(adapter.MAX_CACHE_VARIANTS_PER_SERVER);
});
