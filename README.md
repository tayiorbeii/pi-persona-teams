# pi-persona-teams

`pi-persona-teams` provides ten independent persona agent Markdown files for `pi-subagents`. Every file is canonical and self-contained: it contains its role contract, authority policy, provider guidance, machine-readable contract, and full copied bodies of its assigned methods.

## Installation

Install `pi-subagents` and this package with the normal Pi package installer. `context-mode` and jCodeMunch are optional; their absence does not prevent baseline operation.

```text
pi install npm:pi-subagents
pi install git:github.com/tayiorbeii/pi-persona-teams
```

The package does not replace `pi-subagents` or start a custom child launcher. Discovery, child lifecycle, contexts, worktrees, async runs, and ordinary acceptance remain owned by `pi-subagents`.

## Verification

```bash
bun run verify:personas
bun run verify:no-shared-corpus
bun test
bun run typecheck
```

The parent facade exposes `persona_team` actions `list`, `doctor`, and `run`. The child extension exposes `persona_contract` and gates substantive tools until all methods have been activated with task-specific plans. Completion emits a host-authored `pi.persona-attestation/v1` artifact.

## Persona files

The ten runtime names are `persona-team.founder-ceo`, `persona-team.product-designer`, `persona-team.devex-lead`, `persona-team.engineering-manager`, `persona-team.implementation-engineer`, `persona-team.staff-reviewer`, `persona-team.security-officer`, `persona-team.qa-lead`, `persona-team.release-engineer`, and `persona-team.retro-ops-manager`.

Copied methodology bodies intentionally remain duplicated between files. No shared runtime role/method corpus, generated agent directory, or `skillPath` method library is used.
