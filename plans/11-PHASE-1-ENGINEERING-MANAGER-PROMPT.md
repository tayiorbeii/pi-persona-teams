# Phase 1 Prompt: Engineering Manager Tracer

Use this after the seams have been explicitly confirmed.

---

Implement the first complete vertical slice of `pi-persona-teams`: the Engineering Manager persona.

## Preconditions

- The seams in `03-SEAM-CONFIRMATION.md` are confirmed and recorded.
- You have read `CONTEXT.md` if present.
- You have read relevant ADRs.
- You know the repository’s package manager and test commands.
- You have read the full planning bundle.

## Scope

Create one canonical persona file:

```text
agents/engineering-manager.md
```

It must be self-contained and include:

- Complete Engineering Manager role/persona instructions.
- Machine-readable `pi.persona-contract/v1`.
- Complete context-mode and jCodeMunch policy.
- Full copied bodies of:
  - `persona-team-domain-driven-design`
  - `persona-team-system-design`
  - `persona-team-ddia-systems`
  - `persona-team-clean-architecture`
- Provenance and body hash metadata for each copy.
- Mandatory activation/disposition instructions.
- Read-only planning authority.
- Completion checklist.

Do not create a shared role or method directory. Do not use `skillPath`. Do not generate the file from a central corpus.

## Runtime scope

Implement only enough generic runtime code to support this one role through the public seams:

- Persona file verification command.
- `pi-subagents` package discovery.
- Generic child identity resolution.
- Generic persona-file parser.
- `persona_contract.status`.
- `persona_contract.activate`.
- Pre-activation tool gate.
- Engineering Manager read-only role gate.
- `persona_contract.disposition`.
- `persona_contract.complete`.
- Bounded repair.
- Host-authored attestation.
- Parent `persona_team` list/doctor/run behavior needed for the tracer.
- Optional provider observation needed for the baseline matrix.

Do not generalize for roles that have not been implemented.

## TDD sequence

Use the exact tracer order in Stages 1–11 of `05-VERTICAL-SLICE-DELIVERY-PLAN.md`.

For every cycle:

1. State seam and behavior.
2. Write one failing test.
3. Run it and capture the intended failure.
4. Add minimal implementation.
5. Run the same test.
6. Run the affected group.
7. Record the cycle in `TDD_LOG.md`.
8. Do not refactor.

## Testing rules

Exercise public behavior:

- Validation command.
- `pi-subagents` discovery/preflight.
- Launched child tool behavior.
- Attestation artifact.
- Parent facade.
- End-to-end run.

Do not make parser or ledger unit tests the primary proof. Do not mock owned modules. Use real temp files and a deterministic model/provider boundary.

## Provider baseline

Prove these in vertical order after core enforcement is green:

1. Neither context-mode nor jCodeMunch installed.
2. context-mode available.
3. jCodeMunch available.
4. Both available.
5. One provider fails and fallback is bounded.
6. Both fail without a routing loop.

Provider fakes are allowed because these are external boundaries.

## Phase acceptance

The phase is complete only when a user-level Engineering Manager run:

- Launches through `pi-subagents`.
- Activates all four methods.
- Collects repository evidence.
- Cannot edit source.
- Produces an engineering plan artifact.
- Disposes all four methods with concrete evidence or valid justification.
- Produces a passing host attestation.
- Passes ordinary artifact acceptance.
- Works with no optional providers.
- Uses or accounts for installed providers.
- Leaves a complete TDD log.

Return:

- Files changed.
- Red/green cycle summary.
- Test commands and results.
- Remaining risks.
- Explicit statement that no shared method/role corpus was introduced.

---
