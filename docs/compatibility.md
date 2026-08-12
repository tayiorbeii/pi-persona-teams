# Compatibility

The verified runtime target is:

- Pi coding agent `0.82.1`
- `pi-subagents` `0.31.0`
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

The probe against `0.31.0` reports no package exports, only `loadConfig` and the default extension export, and no public delegation/preflight event. The installed extension registers the model-callable `subagent` tool and owns child lifecycle internally; Pi's extension API exposes that tool through the registry but does not expose its executor as a callable extension API.

## Bounded limitation

`extensions/persona-parent.ts` therefore does not import `pi-subagents` internals, invent event names, spawn a child process, or claim a fake accepted run. `persona_team.list` remains local canonical-file discovery. `persona_team.doctor` reports the model-tool-only limitation. `persona_team.run` returns failed evidence explaining that the parent model must invoke the normal `subagent` tool directly. The pure facade still accepts a host-supplied supported delegation callback for environments that provide one.

The package uses the installed `pi-subagents` package-agent manifest key (`pi.subagents.agents`) and its comma-separated `subagentOnlyExtensions` frontmatter representation. Broader compatibility requires a new verification pass when the host exposes a documented delegation API.
