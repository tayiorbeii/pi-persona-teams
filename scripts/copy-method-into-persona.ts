#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { validatePersonaFile } from "../extensions/internal/persona-file.ts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
const root = resolve(import.meta.dir, "..");
const persona = arg("--persona");
const sourcePath = arg("--source");
if (!persona || !sourcePath) throw new Error("usage: bun scripts/copy-method-into-persona.ts --persona <slug> --source <SKILL.md>");
const target = join(root, "agents", `${persona}.md`);
const validation = validatePersonaFile(target);
if (!validation.valid || !validation.persona) throw new Error(`target persona is invalid: ${validation.errors.join("; ")}`);
const resolvedSourcePath = resolve(sourcePath);
const sourceRoot = execFileSync("git", ["-C", dirname(resolvedSourcePath), "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const portableSourcePath = relative(sourceRoot, resolvedSourcePath).replaceAll("\\", "/");
if (!portableSourcePath || portableSourcePath.startsWith("../") || isAbsolute(portableSourcePath)) throw new Error("source method must be inside its Git repository");
const source = readFileSync(resolvedSourcePath, "utf8");
const name = source.match(/^name:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
if (!name?.startsWith("persona-team-")) throw new Error("source method must declare a persona-team-* name");
if (!validation.persona.contract.requiredMethods.includes(name)) throw new Error(`${name} is not assigned to ${persona}; update the role contract deliberately first`);
if (validation.persona.methods.some((method) => method.id === name)) throw new Error(`${name} is already embedded; refusing duplicate insertion`);
const body = source.replace(/^---\n[\s\S]*?\n---\n?/, "");
const metadata = { id: name, license: "MIT", sourceRepository: "tayiorbeii/prime-persona-teams", sourceCommit: "unknown-unpinned", sourcePath: portableSourcePath, bodySha256: sha256(body) };
const title = name.replace(/^persona-team-/, "").split("-").map((word: string) => word[0].toUpperCase() + word.slice(1)).join(" ");
const block = `### Embedded Method: ${title}\n\n<!-- pi-persona-method:v1\n${JSON.stringify(metadata, null, 2)}\n-->\n\n<pi-persona-method-body id="${name}">${body}</pi-persona-method-body>\n\n`;
const marker = "## Completion Checklist";
const sourceText = readFileSync(target, "utf8");
const position = sourceText.indexOf(marker);
if (position < 0) throw new Error("target has no Completion Checklist section");
writeFileSync(target, `${sourceText.slice(0, position)}${block}${sourceText.slice(position)}`, "utf8");
console.log(`Inserted ${name} into ${target}; review the diff and pin sourceCommit before commit.`);
