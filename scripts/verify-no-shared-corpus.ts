#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const root = resolve(argument("--root") ?? resolve(import.meta.dir, ".."));
const forbiddenDirectories = ["roles", "methods", "corpus", "generated", "shared-skills"];
const failures: string[] = [];
for (const name of forbiddenDirectories) {
  const path = join(root, name);
  if (existsSync(path) && statSync(path).isDirectory()) failures.push(`forbidden runtime directory exists: ${name}/`);
}
const packageText = readFileSync(join(root, "package.json"), "utf8");
if (/skillPath/i.test(packageText)) failures.push("package manifest declares skillPath");
const agents = join(root, "agents");
if (existsSync(agents)) {
  for (const file of readdirSync(agents)) {
    if (!file.endsWith(".md")) failures.push(`unexpected non-persona file under agents/: ${file}`);
  }
}
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log("PASS no shared runtime persona/method corpus detected.");
