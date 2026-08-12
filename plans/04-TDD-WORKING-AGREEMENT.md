# TDD Working Agreement

## Source discipline

This implementation follows the TDD skill at:

```text
https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/engineering/tdd/SKILL.md
```

The pinned rules apply during every cycle, not as a retrospective checklist.

## 1. Before the first cycle

The implementation assistant must:

1. Read `CONTEXT.md` if it exists.
2. Read relevant ADRs.
3. Read repository contribution and test instructions.
4. Inspect the public interfaces already supplied by Pi and `pi-subagents`.
5. Present and confirm the test seams in `03-SEAM-CONFIRMATION.md`.
6. Create a TDD log only after confirmation.

## 2. Test through public behavior

Tests should read as specifications:

```text
engineering manager cannot inspect the repository before activating its methods
persona completion fails when one method has no disposition
persona run remains usable when context-mode is absent
```

Prefer integration-style tests through:

- Package discovery.
- `persona_team`.
- A launched child’s `persona_contract`.
- Actual child tool calls.
- The package verification command.
- Attestation artifacts.
- A user-level end-to-end run.

Do not make private functions or internal object layouts the primary seam.

## 3. Red → green, one tracer at a time

Every cycle follows this exact order:

1. Select one confirmed seam.
2. State one observable behavior.
3. Write one failing test.
4. Run only the narrowest relevant test command.
5. Capture the failure and verify that it fails for the intended missing behavior.
6. Write only enough production code to pass that test.
7. Run the same test.
8. Run the immediately affected test group.
9. Record the result.
10. Select the next behavior based on what the completed cycle taught.

Do not write all planned tests first. Do not implement all architecture layers first.

## 4. Vertical slices, not horizontal layers

Bad sequence:

```text
write every parser test
write every ledger test
write every provider test
then implement all modules
```

Required sequence:

```text
one package-discovery behavior
→ minimal package exposure

one persona-status behavior
→ minimal child extension

one activation-gate behavior
→ minimal ledger and tool gate

one disposition behavior
→ minimal completion validation

one attestation behavior
→ minimal parent verification
```

Each slice reaches a real public seam.

## 5. Red before green

A production change must not precede the failing test that motivates it.

Exceptions require an explicit note and are limited to:

- Repository scaffolding needed to make the test runner execute.
- Non-behavioral configuration required to load the test environment.
- Operator-approved emergency repair outside the planned TDD implementation.

Even scaffolding should be minimal.

## 6. Minimal green

When making a test pass:

- Implement only the behavior asserted by the current test.
- Do not anticipate later persona roles.
- Do not build a generalized policy language before two real roles require it.
- Do not add provider abstractions before the first provider behavior exists.
- Do not add a generic corpus loader; persona content is copied into each file.
- Do not add speculative CLI commands.
- Do not refactor unrelated code.

## 7. Refactoring is a separate stage

Refactoring is not part of the red → green cycle for this project.

After a vertical slice or phase is behaviorally green:

1. Run the independent review prompt.
2. Identify duplication or design pressure demonstrated by real code.
3. Propose refactoring separately.
4. Keep public behavior tests green.
5. Do not refactor persona/method content into shared runtime files.

Code duplication in generic enforcement code may be refactored. Semantic duplication across independent persona files is intentional and must remain.

## 8. Test quality requirements

A good test:

- Exercises a confirmed public seam.
- Describes behavior, not implementation.
- Uses an independent expected value.
- Survives internal refactoring.
- Has one logical assertion.
- Fails when the intended behavior is removed.
- Includes a useful failure message when validating large persona files.

Avoid:

- Tests of private methods.
- Assertions on internal collaborator call order.
- Snapshotting a structure created by the same code under test.
- Computing expected hashes with the same helper under test.
- Calling the database or ledger directly to verify a public action.
- Mocking the package’s own classes or modules.
- Broad snapshots of full agent files as the only behavioral proof.
- Tests whose names describe implementation mechanics.

## 9. Independent expected values

Do not create tautological tests.

Bad:

```typescript
const expected = hashMethodBody(body);
expect(parseAgent(file).methodHash).toBe(expected);
```

when `hashMethodBody` is the production helper under test.

Better:

```typescript
expect(verifyPersonaFixture("valid-engineering-manager.md")).toEqual({
  valid: true,
  role: "engineering-manager",
  requiredMethodCount: 4
});
```

For hash mismatch behavior, use a fixture with a known literal body and a separately calculated literal digest checked into the fixture.

## 10. Mock only system boundaries

Permitted fakes or mocks:

- A deterministic model provider.
- context-mode tool availability and responses.
- jCodeMunch tool availability and responses.
- Time and randomness.
- External process exit behavior.
- Network endpoints.
- In rare cases, a filesystem boundary; prefer real temporary directories.

Do not mock:

- Persona parser.
- Ledger.
- Role-policy evaluator.
- Parent verifier.
- Provider resolver.
- Attestation writer.
- Any module owned by this package when the public interface can be exercised instead.

Use dependency injection at external boundaries. Prefer specific provider interfaces over a generic conditional fetcher.

## 11. Real files over mocked filesystems

Use temporary directories and committed fixtures for:

- Independent agent Markdown files.
- Invalid hash cases.
- Missing method cases.
- Shadowed agent fixtures.
- Attestation artifacts.
- Package installation fixtures.

This makes the test exercise the same parsing and path behavior used in production.

## 12. TDD evidence log

Maintain a file such as `docs/testing/TDD_LOG.md`:

```markdown
## Cycle 006

- Seam: C — child persona contract tool
- Behavior: activate rejects a method not declared by the persona
- Test: `unknown embedded method cannot be activated`
- Red command: `bun test test/integration/persona-contract.test.ts -t "unknown embedded"`
- Red evidence: failed because activate accepted arbitrary IDs
- Minimal green change: validate ID against parsed requiredMethods
- Green evidence: targeted test and persona-contract group pass
- Refactor: none; deferred to review stage
```

The log is evidence, not a substitute for tests.

## 13. Stop conditions

Stop and report rather than widening scope when:

- The seam is not confirmed.
- A public Pi or `pi-subagents` behavior differs from the plan.
- The test requires mocking an internal component to become possible.
- The current interface cannot express the desired behavior.
- context-mode or jCodeMunch tool identity cannot be determined safely.
- A child process cannot expose a host-authored attestation through a supported seam.
- A requested change would reintroduce a shared role/method corpus.
