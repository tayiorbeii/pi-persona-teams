# Compatibility

The verified runtime target is:

- Pi coding agent `0.82.1`
- official `pi-subagents` `main` at or after merged PR #1251 (`aaa303f6367047c1c521d31f635619b8a798801c`; package version currently `0.51.0`)
- Bun `1.3.1`

## Executable compatibility probe

Run this against the installed package:

```bash
PI_SUBAGENTS_ROOT="$(npm root -g)/pi-subagents" bun - <<'BUN'
import { readFileSync } from "node:fs";
const root = process.env.PI_SUBAGENTS_ROOT;
const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
const extension = readFileSync(`${root}/src/extension/index.ts`, "utf8");
const hasDelegationExport = /export[^\n]*(?:delegate|runSubagent|preflight)/i.test(extension);
const hasDelegationEvent = /SUBAGENT_DELEGATION_REQUEST_EVENT|resolveSubagentLaunchContract/.test(extension);
console.log(JSON.stringify({
  version: pkg.version,
  packageExports: pkg.exports ?? null,
  extensionExports: extension.split("\n").filter((line) => /^export\s/.test(line)),
  hasDelegationExport,
  hasDelegationEvent,
  conclusion: hasDelegationExport || hasDelegationEvent ? "inspect further" : "no public extension-side delegation seam"
}, null, 2));
BUN
```

Official `pi-subagents` 0.51 exposes public package APIs including preflight, while its extension still owns model-callable child execution and lifecycle. PR #1251 now resolves explicit relative `extensions` and `subagentOnlyExtensions` entries against the defining agent file. npm `0.51.0` was published before that merge; use official `main` until a later npm release contains the merge commit.

## Bounded limitation

`extensions/persona-parent.ts` does not import `pi-subagents` internals, invent event names, spawn a child process, or claim a fake accepted run. `persona_team.list` remains local canonical-file discovery. `persona_team.doctor` reports the model-tool-only limitation. `persona_team.run` returns failed evidence explaining that the parent model must invoke the normal `subagent` tool directly. The pure facade still accepts a host-supplied supported delegation callback for environments that provide one.

The package uses the official package-agent manifest key (`pi.subagents.agents`), merged agent-relative `subagentOnlyExtensions` resolution, omitted `tools:`/`extensions:` fields for normal Pi capability inheritance, inherited skill discovery, and agent-level timeout/turn/tool budgets. Broader compatibility requires a new verification pass when any of those public contracts change.
