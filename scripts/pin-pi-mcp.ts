#!/usr/bin/env bun
// Pins pi's per-project MCP definitions to ~/.pi/agent/mcp.json so the shared
// metadata cache stops flipping between projects (see scripts/lib/pin-pi-mcp.ts).
// Dry run by default; pass --apply to write the gitignored .pi/mcp.json files.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { planPin } from "./lib/pin-pi-mcp.ts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes("--apply");
const servers = (arg("--servers") ?? "context-mode,jcodemunch,jdocmunch").split(",").map((name) => name.trim()).filter(Boolean);
const roots = (arg("--roots") ?? [join(homedir(), "Documents", "Projects"), join(homedir(), ".herdr-projects")].join(",")).split(",").map((root) => resolve(root));
const exclude = (arg("--exclude") ?? "").split(",").map((path) => path.trim()).filter(Boolean).map((path) => resolve(path));
const globalPath = join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "mcp.json");
const global = (JSON.parse(readFileSync(globalPath, "utf8")) as { mcpServers?: Record<string, Record<string, unknown>> }).mcpServers ?? {};

const files = roots.flatMap((root) => {
  try {
    return execFileSync("find", [root, "-maxdepth", "6", "-name", ".mcp.json", "-not", "-path", "*/node_modules/*"], { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}).filter((file) => !exclude.some((path) => file.startsWith(`${path}/`) || file === path)).sort();

const counts: Record<string, number> = {};
for (const file of files) {
  let plan;
  try {
    plan = planPin(file, global, servers);
  } catch (error) {
    console.log(`error           ${file}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  counts[plan.status] = (counts[plan.status] ?? 0) + 1;
  if (plan.status === "already-aligned") continue;
  const label = plan.status === "pinned" ? (apply ? "pinned" : "would-pin") : plan.status;
  console.log(`${label.padEnd(20)} ${plan.projectDir} [${plan.divergent.join(", ")}]`);
  if (plan.status === "pinned" && apply) {
    mkdirSync(dirname(plan.overridePath), { recursive: true });
    writeFileSync(plan.overridePath, `${JSON.stringify(plan.next, null, 2)}\n`);
  }
}
console.log(`\n${files.length} project .mcp.json files: ${Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(", ") || "none"}${apply ? "" : " (dry run; pass --apply to write)"}`);
console.log("not-pi-root: pi only reads that .mcp.json when its cwd is exactly that directory; no .pi/ was created there because it would move pi's project root.");
