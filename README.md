# pi-persona-teams

`pi-persona-teams` provides ten independent persona agent Markdown files for `pi-subagents`. Every file is canonical and self-contained: it contains its role contract, authority policy, provider guidance, machine-readable contract, and full copied bodies of its assigned methods.

## Installation

Install official `pi-subagents`, configure the `context-mode` and `jcodemunch` MCP servers in `pi-mcp-adapter`, then install this package.

PR [nicobailon/pi-subagents#1251](https://github.com/nicobailon/pi-subagents/pull/1251) merged the package-relative child-extension fix on 2026-08-18. It landed after npm `pi-subagents@0.51.0` was published, so use official `main` until the next npm release contains commit `aaa303f6367047c1c521d31f635619b8a798801c`.

```text
pi install git:github.com/nicobailon/pi-subagents
pi install git:github.com/tayiorbeii/pi-persona-teams
```

The canonical agents intentionally omit `tools:` and `extensions:` frontmatter. Official `pi-subagents` therefore preserves Pi's normal builtin and discovered extension registry—including tools such as `fffind`, `ffgrep`, and the generic `mcp` gateway—instead of replacing it with a stale package allowlist. `persona_contract.status` reports the actual registry; context-mode and jCodeMunch direct tools are preferred when they are present, with the generic MCP route or bounded native tools as fallback. Octocode remains a read-only CLI route for external GitHub evidence; it is not an MCP provider and is restricted to the version-pinned `npx -y octocode@18.3.0` command surface.

The package does not replace `pi-subagents` or start a custom child launcher. Discovery, child lifecycle, contexts, worktrees, async runs, and ordinary acceptance remain owned by `pi-subagents`.

## Verification

```bash
bun run verify:personas
bun run verify:no-shared-corpus
bun test
bun run typecheck
```

The parent facade exposes `persona_team` actions `list`, `doctor`, and `run`. `run` accepts three orchestration parameters. `mode`: `wait` (default) blocks until terminal completion with full attestation verification; `launch` returns a run handle — `status: "launched"`, `runKey`, and the child `runId` as soon as the bridge reports it — after only the bridge acceptance ack (about 30 seconds), so the parent never blocks on long reviewer runs. `runKey`: an idempotency key; re-calling `run` with the same key while the child is in flight attaches to the original attempt instead of launching a duplicate child (default: a digest of persona and task). The in-flight map clears at terminal, so a post-completion call with the same key starts a fresh child: collect with the same `runKey` while the run is in flight, and check `.pi-persona/attestations/` for the runId first after long delays. `responseTimeoutMs`: a per-call bound for the parent wait (default 600000); the child run deadline is automatically the parent wait minus a 30-second margin, so typed bridge terminals (`timed_out`/`cancelled`) normally arrive before the parent's generic timer. A wait-mode timeout reports `timedOut: true` with the child `runId` when known and has already asked the bridge to cancel the child, so timed-out attempts are never orphaned. Persona children inherit normal Pi tools, ambient extensions, project context, and discovered skills; role policy still governs mutations and release authority. The child extension exposes `persona_contract`; its first `status` call reports the actual child tool registry, and substantive tools remain gated until all methods have task-specific activations. Completion emits a host-authored `pi.persona-attestation/v1` artifact.

Persona defaults are deliberately bounded: 10-minute parent wait (child deadline 30 seconds earlier), eight turns plus one finalization turn, and an 18-call hard tool stop. Run at most two personas concurrently; prefer per-call `responseTimeoutMs` of 300000-420000 for read-only review personas and 420000-600000 for `implementation-engineer`; launch reviewer personas with `mode: "launch"` and collect with the same `runKey` rather than blocking the session; require an explicit output schema with `toolVisibility`; and never treat partial or timed-out transcripts as evidence. The bounded shell policy is authority-aware: implementers may use Cargo execution, setup, formatting, repair, cleanup, and dependency commands required by the task; reviewers may run validation plus non-source-mutating Cargo execution/setup commands such as `run`, `install`, and `clean`. Source-mutating reviewer commands and Cargo registry/release operations remain blocked. See [`skills/persona-team/SKILL.md`](./skills/persona-team/SKILL.md).

## Persona files

The ten runtime names are `persona-team.founder-ceo`, `persona-team.product-designer`, `persona-team.devex-lead`, `persona-team.engineering-manager`, `persona-team.implementation-engineer`, `persona-team.staff-reviewer`, `persona-team.security-officer`, `persona-team.qa-lead`, `persona-team.release-engineer`, and `persona-team.retro-ops-manager`.

Copied methodology bodies intentionally remain duplicated between files. No shared runtime role/method corpus, generated agent directory, or `skillPath` method library is used.
