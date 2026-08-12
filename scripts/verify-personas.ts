#!/usr/bin/env bun
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validatePersonaFile } from "../extensions/internal/persona-file.ts";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const agentDirectory = join(root, "agents");
const requested = process.argv.slice(2);
const files = requested.length > 0 ? requested.map((file: string) => resolve(file)) : (existsSync(agentDirectory) ? readdirSync(agentDirectory).filter((file: string) => file.endsWith(".md")).sort().map((file: string) => join(agentDirectory, file)) : []);
let failed = false;
if (files.length === 0) {
  console.error("No persona files found.");
  process.exit(1);
}
if (requested.length === 0 && files.length !== 10) {
  console.error(`Expected exactly ten canonical persona files, found ${files.length}.`);
  process.exit(1);
}
for (const file of files) {
  const result = validatePersonaFile(file);
  const errors = [...result.errors];
  if (result.valid && result.persona) {
    for (const method of result.persona.methods) {
      if (method.body.trim().length === 0) errors.push(`embedded method body is empty: ${method.id}`);
    }
  }
  if (errors.length === 0) {
    console.log(`PASS ${file}: ${result.runtimeName} (${result.requiredMethodCount} methods)`);
  } else {
    failed = true;
    console.error(`FAIL ${file}`);
    for (const error of errors) console.error(`  - ${error}`);
  }
}
if (!failed) console.log(`Validated ${files.length} independent persona file(s).`);
process.exit(failed ? 1 : 0);
