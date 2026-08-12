# Review, Refactor, and Release Prompt

This stage is intentionally separate from the TDD red → green loop.

---

Review the current `pi-persona-teams` implementation after its current phase is green.

## Inputs

Read:

- Confirmed seams.
- TDD log.
- Current phase acceptance gate.
- Relevant ADRs.
- All changed code and persona files.
- Test results.

## Review objectives

Assess:

- Public behavior correctness.
- `pi-subagents` API use.
- Persona-file independence.
- Enforcement bypasses.
- Role authority.
- Attestation integrity.
- Provider fallback loops.
- Test quality and sensitivity.
- Error diagnostics.
- Package installation and rollback.
- Unnecessary complexity.

## Non-negotiable architecture

Do not refactor:

- Copied methods into a shared runtime directory.
- Persona role text into shared includes.
- Persona files into generated output.
- Role-to-method semantics into a central registry.
- Child execution into a custom launcher.
- context-mode or jCodeMunch into required dependencies.

Semantic duplication across persona files is intentional.

## Review test quality

Flag tests that:

- Exercise private methods instead of public seams.
- Mock owned modules.
- Assert collaborator call counts.
- Use production code to compute expected values.
- Snapshot broad generated structures without behavioral sensitivity.
- Would break on harmless internal refactoring.
- Do not fail when the relevant behavior is removed.

## Refactoring policy

Refactor only after review identifies demonstrated design pressure.

Permitted examples:

- Shared generic parser primitives.
- Shared generic ledger validation.
- Shared generic attestation verification.
- Shared provider adapter utilities.
- Better error types.
- Removal of generic runtime duplication.

Not permitted:

- Deduplicating persona semantics or method bodies.
- Inventing a generic policy DSL without multiple proven cases.
- Changing public seams without operator confirmation and new red tests.

## Refactoring process

For each approved refactor:

1. State the behavior-preserving goal.
2. Confirm existing public tests cover it.
3. Make one bounded refactor.
4. Run affected tests.
5. Run phase gate.
6. Record evidence.
7. Do not add new behavior during refactoring.

New behavior returns to a red → green cycle.

## Release readiness

Before release, verify:

- All phase gates pass.
- `verify:personas` passes.
- `verify:no-shared-corpus` passes.
- Typecheck/lint/build pass.
- Provider baseline passes.
- Installation test passes.
- Removal/rollback test passes.
- No secrets or private paths are committed.
- README documents normal `pi-subagents` dependency.
- README documents optional context-mode and jCodeMunch behavior.
- Changelog identifies persona content changes separately from runtime changes.
- Package version and compatibility range are explicit.

Return:

- Review findings by severity.
- Refactors performed.
- Tests run.
- Remaining risks.
- Release recommendation.
- Explicit confirmation that independent persona files and copied methods remain intact.

---
