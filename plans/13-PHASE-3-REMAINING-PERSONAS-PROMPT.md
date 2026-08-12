# Phase 3 Prompt: Remaining Personas

Use this only after Engineering Manager, Implementation Engineer, and Staff Reviewer are green and separately reviewed.

---

Add the remaining seven persona files one at a time. Every file must be independent and must contain full copies of all assigned methods.

## Order

1. Security Officer
2. QA Lead
3. Product Designer
4. DevEx Lead
5. Founder & CEO
6. Release Engineer
7. Retro / Ops Manager

Do not create all files in one batch.

## Required method copies

### Security Officer

- `persona-team-clean-architecture`
- `persona-team-ddia-systems`
- `persona-team-domain-driven-design`

### QA Lead

- `persona-team-pragmatic-programmer`
- `persona-team-release-it`
- `persona-team-ux-heuristics`

### Product Designer

- `persona-team-inspired-product`
- `persona-team-jobs-to-be-done`
- `persona-team-mom-test`
- `persona-team-lean-ux`
- `persona-team-continuous-discovery`
- `persona-team-design-sprint`
- `persona-team-ux-heuristics`

### DevEx Lead

- `persona-team-pragmatic-programmer`
- `persona-team-system-design`
- `persona-team-high-perf-browser`
- `persona-team-web-typography`

### Founder & CEO

- `persona-team-inspired-product`
- `persona-team-jobs-to-be-done`
- `persona-team-blue-ocean-strategy`
- `persona-team-lean-startup`

### Release Engineer

- `persona-team-release-it`

### Retro / Ops Manager

- `persona-team-traction-eos`
- `persona-team-drive-motivation`
- `persona-team-pragmatic-programmer`

## Per-persona vertical sequence

For exactly one persona at a time:

1. Confirm any new seam or authority behavior.
2. Add one failing independent-file validation test.
3. Add only enough file content to pass.
4. Add discovery behavior.
5. Add exact method status behavior.
6. Add activation behavior.
7. Add one role-permitted tool behavior.
8. Add one role-prohibited behavior.
9. Add method disposition behavior.
10. Add attestation behavior.
11. Add one representative end-to-end task.
12. Run the persona phase gate.
13. Stop and review before the next persona when the role introduces new generic policy.

## Role-specific acceptance

### Security Officer

- Maintains independent reporting.
- Can inspect trust boundaries and abuse cases.
- Cannot approve or edit the implementation by default.
- Produces structured severity/evidence/findings.

### QA Lead

- Tests through user-visible acceptance seams.
- Captures reproducible evidence.
- Does not replace tests with prose.
- Cannot mark a release approved outside its role.

### Product Designer

- Produces experience contract and acceptance criteria.
- Preserves unresolved product assumptions.
- Does not implement production code.

### DevEx Lead

- Evaluates API/CLI/SDK and contributor workflows.
- Uses current repository evidence when relevant.
- Does not become the implementation writer.

### Founder & CEO

- Frames strategic choices and tradeoffs.
- Uses repository tools only when the task depends on current implementation.
- Does not invent implementation approval authority.

### Release Engineer

- Produces reversible release preparation.
- Requires explicit parent/operator approval for irreversible execution.
- Records release evidence and rollback.

### Retro / Ops Manager

- Uses completed evidence.
- Produces learning and improvement proposals.
- Does not retroactively change acceptance or release status.

## Final full-set gate

Prove:

- Exactly ten canonical package agents.
- Every file validates independently.
- Every method is copied into every role that uses it.
- No shared runtime role/method corpus exists.
- Every role has at least one representative end-to-end behavior.
- Independent authority boundaries hold.
- Provider matrix remains green.
- Full test and verification suite passes.

After green behavior, stop and run the separate review/refactor prompt.

---
