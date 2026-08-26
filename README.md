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

The parent facade exposes `persona_team` actions `list`, `doctor`, and `run`. Persona children inherit normal Pi tools, ambient extensions, project context, and discovered skills; role policy still governs mutations and release authority. The child extension exposes `persona_contract`; its first `status` call reports the actual child tool registry, and substantive tools remain gated until all methods have task-specific activations. Completion emits a host-authored `pi.persona-attestation/v1` artifact.

Persona defaults are deliberately bounded: 10-minute timeout, eight turns plus one finalization turn, and an 18-call hard tool stop. Run at most two personas concurrently, require an explicit output schema with `toolVisibility`, and never treat partial or timed-out transcripts as evidence. The bounded shell policy is authority-aware: implementers may use Cargo execution, setup, formatting, repair, cleanup, and dependency commands required by the task; reviewers may run validation plus non-source-mutating Cargo execution/setup commands such as `run`, `install`, and `clean`. Source-mutating reviewer commands and Cargo registry/release operations remain blocked. See [`skills/persona-team/SKILL.md`](./skills/persona-team/SKILL.md).

## Persona files

The ten runtime names are `persona-team.founder-ceo`, `persona-team.product-designer`, `persona-team.devex-lead`, `persona-team.engineering-manager`, `persona-team.implementation-engineer`, `persona-team.staff-reviewer`, `persona-team.security-officer`, `persona-team.qa-lead`, `persona-team.release-engineer`, and `persona-team.retro-ops-manager`.

Copied methodology bodies intentionally remain duplicated between files. No shared runtime role/method corpus, generated agent directory, or `skillPath` method library is used.
