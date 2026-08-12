# Master Implementation Prompt

Use this prompt with the full planning bundle.

---

You are implementing a new ordinary Pi package that provides ten strongly enforced persona subagents through `pi-subagents`.

Read every planning document in this bundle before making changes. Treat them as the current architecture. They supersede any earlier shared-corpus proposal.

## Critical architecture

Each persona is one canonical, self-contained Markdown agent file.

Every persona file contains:

- The full role contract.
- The full authority policy.
- The full context-provider policy.
- A machine-readable persona contract.
- The complete copied body of every methodology assigned to that role.
- Method provenance and per-body hashes.
- Completion and evidence requirements.

Do not create or retain a shared runtime role corpus, shared runtime method corpus, `skillPath` method library, or generated-agent build. The same method must be copied into every persona that uses it. Duplication is intentional.

Shared code is allowed only for generic runtime mechanics such as parsing the selected file, tool gating, ledgers, provider observation, and attestation verification.

## Runtime boundaries

- Use `pi-subagents` for discovery, child launch, contexts, worktrees, async behavior, missions, status, resume, and ordinary acceptance.
- Do not fork `pi-subagents`.
- Do not write a second child-process launcher.
- Add a generic child-only extension for persona enforcement.
- Add a thin parent facade that delegates through supported `pi-subagents` APIs and verifies host-authored attestations.
- context-mode and jCodeMunch are optional. Baseline operation must work without them.
- When installed and relevant, prefer them according to the provider plan.
- Permit bounded native fallback after absence or failure and prevent redirect loops.

## TDD requirements

Follow the pinned Matt Pocock TDD skill exactly:

1. Read `CONTEXT.md` if present.
2. Read relevant ADRs and repository instructions.
3. Before writing any test, reproduce the seams from `03-SEAM-CONFIRMATION.md` and ask me to confirm them.
4. Do not write a test at an unconfirmed seam.
5. After confirmation, work in vertical tracer bullets.
6. One behavior, one failing test, one minimal implementation.
7. Run the failing test and verify the intended red state.
8. Implement only enough to make that test green.
9. Do not write the entire test suite before implementation.
10. Test through public interfaces.
11. Do not mock this package’s own modules or collaborators.
12. Mock/fake only external boundaries such as the model, context-mode, jCodeMunch, time, or network.
13. Use real temporary files and directories.
14. Use independent literal expectations, not production helpers that reproduce the answer.
15. Do not refactor during the red → green cycle.
16. Record every cycle in `docs/testing/TDD_LOG.md`.
17. Perform refactoring only in the separate review stage.

## First implementation scope

Implement only the Engineering Manager vertical slice described in:

- `02-INDEPENDENT-AGENT-FILE-SPEC.md`
- `05-VERTICAL-SLICE-DELIVERY-PLAN.md`
- `06-ENFORCEMENT-RUNTIME-DESIGN.md`
- `11-PHASE-1-ENGINEERING-MANAGER-PROMPT.md`

Do not create the other nine persona files merely to fill the directory. The first phase proves the architecture with one complete independent file and four complete copied methods.

## Required Engineering Manager methods

The Engineering Manager file must copy in full:

- `persona-team-domain-driven-design`
- `persona-team-system-design`
- `persona-team-ddia-systems`
- `persona-team-clean-architecture`

Copy from the pinned/current approved `prime-persona-teams` source, preserving license and provenance in the embedded metadata format. Do not replace full content with links or summaries.

## Required public behavior

The first accepted phase must demonstrate:

- Independent persona-file validation.
- `pi-subagents` discovery as `persona-team.engineering-manager`.
- Child `persona_contract.status`.
- Activation of all four methods before substantive tools.
- Rejection of unknown methods.
- Read-only Engineering Manager authority.
- Method dispositions.
- Bounded completion repair.
- Host-authored `pi.persona-attestation/v1`.
- Parent verification.
- Baseline operation without context-mode or jCodeMunch.
- Optional-provider detection and bounded fallback.
- One complete Engineering Manager end-to-end planning task.

## Working style

Show red and green evidence as you proceed. Do not claim completion based only on code inspection. Do not broaden the scope to unrelated package features. When a documented Pi or `pi-subagents` interface differs from the installed version, stop at that seam, report the evidence, and propose the narrowest compatible adjustment.

Begin by inspecting the repository and presenting the test seams for confirmation. Do not write tests yet.

---
