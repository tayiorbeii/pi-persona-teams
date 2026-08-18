# ADR 0002: child extension loading fixes

## Context

Two independent defects blocked persona child admission:

1. `extensions/persona-child.ts` called `pi.getAllTools()` while the extension factory was still loading. Pi exposes throwing action-method stubs until `ExtensionRunner.bindCore()` runs, so the call threw and the error was cached as `startupError`. That permanently rejected `persona_contract` and blocked every other tool, producing `Persona admission failed: Extension runtime not initialized. Action methods cannot be called during extension loading.`
2. `pi-subagents` forwarded `subagentOnlyExtensions: ../extensions/persona-child.ts` to the child Pi unchanged. Pi resolved the relative path against the child's launch cwd instead of the directory containing the defining agent file, producing `Extension path does not exist`.

## Decision

1. `persona-child.ts` now constructs the runtime at load time without touching `pi.getAllTools()`. Tool discovery is deferred to the existing `session_start` handler, which runs after `bindCore()`; it reprobes providers and, if construction failed at load time, retries it. A regression test (`test/child-extension.test.ts`) asserts `getAllTools` is not called during loading and that `persona_contract` is healthy after `session_start`.
2. `pi-subagents` resolves explicit relative filesystem paths (`./`, `../`) in `extensions` and `subagentOnlyExtensions` against `dirname(filePath)` of the defining agent file at discovery time. Absolute paths, tilde paths, and bare package/module specifiers are left unchanged. The upstream patch is recorded in `docs/pi-subagents-relative-extension-paths.patch` (against `nicobailon/pi-subagents`).

## Consequences

- Package personas keep their canonical relative `../extensions/persona-child.ts` and resolve correctly once the `pi-subagents` fix is installed.
- User-scope shadows in `~/.agents/` cannot reach the package extension through a relative path, because their directory layout differs from the package. They must use the absolute installed extension path (`~/.pi/agent/git/github.com/tayiorbeii/pi-persona-teams/extensions/persona-child.ts`). This is an installation/generation concern, not a runtime rewrite.
