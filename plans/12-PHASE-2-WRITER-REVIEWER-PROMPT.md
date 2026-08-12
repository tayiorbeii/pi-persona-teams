# Phase 2 Prompt: Implementation Engineer and Staff Reviewer

Use this only after the Engineering Manager phase gate passes and its code has completed the separate review stage.

---

Extend the package with two more independent personas:

```text
agents/implementation-engineer.md
agents/staff-reviewer.md
```

Each file is canonical and self-contained. Copy every assigned method body into each file even when it duplicates another persona.

## Implementation Engineer copied methods

- `persona-team-clean-code`
- `persona-team-refactoring-patterns`
- `persona-team-software-design-philosophy`
- `persona-team-pragmatic-programmer`

## Staff Reviewer copied methods

- `persona-team-clean-code`
- `persona-team-clean-architecture`
- `persona-team-refactoring-patterns`
- `persona-team-software-design-philosophy`

Do not move repeated methods into a shared directory. Do not add a runtime method loader.

## TDD constraints

- Confirm any new public seams before writing tests.
- Reuse already confirmed seams without re-asking unless the interface changes.
- Implement one persona end-to-end before beginning the next.
- Within a persona, one failing behavior test and one minimal green implementation at a time.
- Do not bulk-create both files and all tests.
- Do not mock owned modules.
- Do not refactor during red → green.

## Implementation Engineer vertical sequence

1. Independent file validates alone.
2. Agent is discoverable.
3. Exact four methods appear in status.
4. Activation gate applies.
5. Assigned workspace write succeeds.
6. Out-of-scope write fails.
7. Build/test command succeeds.
8. Release/deploy action fails.
9. Persona/enforcement file modification fails.
10. Method dispositions pass.
11. Writer attestation passes.
12. End-to-end bounded implementation task passes ordinary checks.

## Staff Reviewer vertical sequence

1. Independent file validates alone.
2. Agent is discoverable.
3. Exact four methods appear in status.
4. Activation gate applies.
5. Candidate inspection succeeds.
6. Test/read-only validation succeeds.
7. Candidate edit fails by default.
8. Review artifact succeeds.
9. Self-review/non-independent identity is rejected or marked invalid.
10. Method dispositions pass.
11. Reviewer attestation passes.
12. End-to-end independent review task passes.

## Writer/reviewer system acceptance

Run a complete workflow:

```text
approved task
→ Implementation Engineer candidate
→ independent Staff Reviewer
→ correction by the original writer when needed
→ fresh Staff Reviewer acceptance
```

Prove:

- The writer cannot self-approve.
- The reviewer does not silently edit the candidate.
- Each run has its own attestation.
- Ordinary tests and persona attestations are both required.
- The parent keeps `pi-subagents` as lifecycle authority.
- context-mode and jCodeMunch remain optional.
- No shared role/method corpus has appeared.

After behavior is green, stop. Use `14-REVIEW-REFACTOR-AND-RELEASE-PROMPT.md` for refactoring.

---
