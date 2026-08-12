# Test Matrix and Acceptance Gates

## Important execution note

This document is an acceptance inventory. It must not be converted into a horizontal batch of tests.

Implement each row only when its vertical tracer becomes current:

```text
one test
→ red
→ minimal green
→ next test
```

## 1. Test layers

### Contract/integration tests

Exercise:

- Real persona Markdown fixtures.
- Real temporary directories.
- Public validation command.
- Public extension tools.
- Real generic enforcement code.
- Deterministic external provider fakes.

### Runtime integration tests

Exercise:

- Real Pi extension loading where practical.
- Real `pi-subagents` discovery/preflight.
- A deterministic model provider at the external model boundary.
- Child environment identity.
- Actual tool-call blocking and result behavior.
- Attestation persistence.

### End-to-end tests

Exercise:

- A parent-level persona request.
- A real child Pi process.
- A small fixture repository.
- Artifact creation.
- Persona attestation.
- Ordinary acceptance gate.
- Provider permutations.

## 2. Persona file validation inventory

| Behavior | Public seam | Expected result |
|---|---|---|
| Valid independent Engineering Manager | verification command | pass with role and count 4 |
| Missing contract block | verification command | fail with file |
| Duplicate contract block | verification command | fail |
| Runtime name mismatch | verification command | fail |
| Missing required embedded method | verification command | fail with method ID |
| Extra undeclared embedded method | verification command | fail |
| Duplicate method ID | verification command | fail |
| Body tag mismatch | verification command | fail |
| Body hash mismatch | verification command | fail |
| Unsupported authority | verification command | fail |
| Dangling required local reference | verification command | fail |
| Other persona files absent | verification command | selected file still passes |

## 3. Discovery and preflight inventory

| Behavior | Expected |
|---|---|
| Package exposes canonical agent | discovered |
| Canonical package name is exact | `persona-team.<slug>` |
| Child-only enforcer resolves | present in preflight |
| No method skill paths resolve | none |
| Project collision exists | reported |
| Unauthorized shadow selected | parent facade rejects |
| Unknown role requested | fail before child spawn |

## 4. Activation inventory

| Behavior | Expected |
|---|---|
| Status before activation | all methods pending |
| Activate known method | accepted |
| Activate unknown method | rejected |
| Activate same method twice | idempotent or explicit already-active result |
| Empty planned application | rejected |
| Generic planned application | rejected by documented bounded rule |
| One of four active | substantive tool still blocked |
| Four of four active | permitted tools admitted |

## 5. Role-policy inventory

### Engineering Manager

- Read/search allowed after activation.
- Planning artifact path allowed only when assigned.
- Source edit blocked.
- Dependency install blocked.
- Git mutation blocked.
- Deployment blocked.
- Read-only build metadata command allowed.
- Escalation allowed.
- Self-approval does not alter acceptance.

### Implementation Engineer

- Assigned source edits allowed.
- Out-of-scope path blocked.
- Tests/build allowed.
- Release blocked.
- Persona/enforcement files protected.
- Self-approval rejected.

### Staff Reviewer

- Candidate inspection allowed.
- Test execution allowed.
- Candidate edit blocked by default.
- Review artifact allowed.
- Review of own earlier writer run rejected or explicitly marked non-independent.

Add equivalent role-specific rows only when each persona becomes the current vertical slice.

## 6. Completion inventory

| Behavior | Expected |
|---|---|
| Missing activation | completion fails |
| Missing disposition | completion fails |
| `applied` without evidence | fails |
| `not_applicable` without justification | fails |
| Conflicting terminal state | fails |
| All complete | passes |
| One repair fixes deficiencies | passes |
| Repair budget exhausted | terminal failure |

## 7. Attestation inventory

| Behavior | Expected |
|---|---|
| Passing ledger | v1 passing attestation |
| Missing run binding | parent rejects |
| Wrong child index | parent rejects |
| Wrong contract digest | parent rejects |
| Wrong agent file digest | parent rejects |
| Wrong method hash | parent rejects |
| Child emits fake JSON in prose | ignored |
| Blocked prohibited call | represented |
| Unresolved violation | status cannot be passed |
| Provider degraded | represented |

## 8. Provider matrix

| context-mode | jCodeMunch | Scenario | Expected |
|---|---|---|---|
| absent | absent | baseline plan | succeeds with unavailable statuses |
| present | absent | large docs + code | context-mode used; code native fallback |
| absent | present | code planning | jCodeMunch used; content native fallback |
| present | present | code planning with large docs | both used when relevant |
| startup failure | present | code planning | context-mode degraded; jCodeMunch works |
| present | call failure | code planning | one jCodeMunch failure; bounded native fallback |
| call failure | call failure | baseline | degraded evidence; no loop |
| present | present | non-code strategy | valid jCodeMunch not-applicable |

## 9. Context and lifecycle inventory

- Fresh child.
- Forked child.
- Foreground execution.
- Async execution.
- Child compaction.
- Parent compaction.
- Retained-child resume.
- Worktree execution.
- Monorepo nested working directory.
- Missing project trust.
- Package reload.

These should be added only after the core foreground/fresh tracer passes.

## 10. Tautology checks

For each important test, verify:

- Expected role names are literals from the agreed public contract.
- Expected method count is a literal.
- Expected method IDs are literal fixtures.
- Expected digest fixture was independently produced.
- Removing the behavior makes the test fail.
- The test does not call the production helper to compute its expected result.

## 11. Mocking rules

Mock/fake only:

- Model provider.
- context-mode.
- jCodeMunch.
- Time/randomness.
- External process/network boundary.

Use real:

- Persona files.
- Parser.
- Ledger.
- Role policy.
- Parent verifier.
- Temporary filesystem.
- Attestation artifacts.
- Package validation command.

## 12. Phase gates

### Gate A — independent Engineering Manager file

- Validation passes.
- No shared method directory exists.
- File contains four complete methods.
- Independence test passes.

### Gate B — child enforcement

- Activation gate passes.
- Read-only role policy passes.
- Completion ledger passes.
- Attestation passes.

### Gate C — parent integration

- Preflight identity passes.
- Delegation uses `pi-subagents`.
- Parent rejects invalid attestations.
- Dual persona/work acceptance works.

### Gate D — provider compatibility

- All baseline provider permutations pass.
- Failure fallback is bounded.
- No routing loop test passes.

### Gate E — Engineering Manager end-to-end

- Plan artifact produced.
- No source modifications.
- Four method dispositions.
- Passing attestation.
- Passing artifact acceptance.

### Gate F — writer/reviewer separation

- Writer can implement within scope.
- Reviewer remains independent.
- Self-approval cannot pass.
- Both attestations and ordinary checks pass.

### Gate G — full persona set

- Exactly ten independent files.
- Every file validates alone.
- Every role has one end-to-end representative task.
- Complete CI suite passes.

## 13. Suggested CI commands

Exact commands should follow the repository’s existing package manager and conventions. A possible shape:

```bash
bun run typecheck
bun run test:unit
bun run test:integration
bun run test:e2e
bun run verify:personas
bun run verify:no-shared-corpus
```

Do not add commands speculatively before the corresponding public behavior and test exist.
