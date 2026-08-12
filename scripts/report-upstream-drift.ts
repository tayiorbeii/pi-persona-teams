#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validatePersonaFile } from "../extensions/internal/persona-file.ts";
function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const root = resolve(import.meta.dir, "..");
const persona = arg("--persona");
const sourceRoot = arg("--source-root");
if (!persona || !sourceRoot) throw new Error("usage: bun scripts/report-upstream-drift.ts --persona <slug> --source-root <methods-dir>");
const local = validatePersonaFile(join(root, "agents", `${persona}.md`));
if (!local.persona) throw new Error(local.errors.join("; "));
for (const method of local.persona.methods) {
  const upstreamPath = join(resolve(sourceRoot), method.id, "SKILL.md");
  try {
    const upstream = readFileSync(upstreamPath, "utf8").replace(/^---\n[\s\S]*?\n---\n?/, "");
    const crypto = await import("node:crypto");
    const hash = crypto.createHash("sha256").update(upstream, "utf8").digest("hex");
    console.log(`${hash === method.bodySha256 ? "unchanged" : "upstream changed"} ${method.id}`);
  } catch {
    console.log(`upstream removed ${method.id}`);
  }
}
