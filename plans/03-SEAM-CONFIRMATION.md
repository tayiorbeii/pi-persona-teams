# Test Seam Confirmation

## Why this document exists

The project follows Matt Pocock’s TDD guidance: tests must exercise behavior through public interfaces, and no test is written at a seam that has not been explicitly agreed.

The implementation assistant may inspect the codebase and propose refinements before confirmation. It must not create or modify a test until the operator confirms the seams below.

## Proposed public seams

### Seam A — package discovery

**Public interface:** the normal `pi-subagents` agent discovery/list/preflight interface.

**Observable behavior:**

- The package exposes ten canonical persona agents.
- A persona has the expected package-qualified runtime name.
- The selected source is the package agent, unless an override is explicitly authorized.
- A missing or malformed agent is reported without starting a child.

**Tests must not:** import the internal agent parser directly merely to assert private data structures.

---

### Seam B — persona facade

**Public interface:** `persona_team` with actions such as `list`, `doctor`, and `run`.

**Observable behavior:**

- `list` returns canonical personas and descriptions.
- `doctor` reports readiness and concrete deficiencies.
- `run` delegates through `pi-subagents`.
- `run` rejects missing or invalid persona attestations.
- `run` returns accepted output only when persona compliance and ordinary acceptance both pass.

**Tests must not:** assert which private helper function is called.

---

### Seam C — child persona contract tool

**Public interface:** `persona_contract` inside a launched persona child.

**Observable behavior:**

- `status` reports the exact role and required embedded methods.
- `activate` accepts only required methods.
- Activation requires a task-specific planned application.
- `disposition` accepts one valid terminal disposition per method.
- `complete` fails with actionable deficiencies or returns a successful attestation receipt.

**Tests must not:** mutate the ledger object directly.

---

### Seam D — child tool policy

**Public interface:** actual tool calls made from a launched child.

**Observable behavior:**

- Substantive tools are blocked until mandatory activation is complete.
- Role-prohibited actions are blocked with a useful reason.
- Permitted tools work.
- Provider failure allows bounded native fallback.
- Repeated redirect loops are prevented.

**Tests must not:** call the private command classifier as the primary proof.

---

### Seam E — persona attestation

**Public interface:** the attestation artifact or structured result exposed to the parent.

**Observable behavior:**

- It uses `pi.persona-attestation/v1`.
- It is bound to the canonical agent, child run, contract digest, and method hashes.
- It records activation, disposition, evidence, provider status, and policy violations.
- It cannot be replaced by child-authored prose.
- Failed compliance cannot be represented as success.

**Tests must not:** construct a private ledger and call a serializer as the only proof.

---

### Seam F — context provider resolution

**Public interface:** provider behavior observed through persona execution and doctor results.

**Observable behavior:**

- Neither provider installed: baseline execution still works.
- context-mode installed: relevant content work uses it or records a valid non-use reason.
- jCodeMunch installed: relevant code exploration uses it or records a valid non-use reason.
- Provider startup/call failure produces degraded evidence and bounded fallback.
- Native fallback does not become an infinite routing loop.

**Tests may fake:** context-mode and jCodeMunch because they are external system boundaries.

**Tests must not mock:** the package’s own provider resolver merely to force a result.

---

### Seam G — self-contained persona file validation

**Public interface:** package validation command, for example `bun run verify:personas`.

**Observable behavior:**

- A valid independent persona passes.
- Missing embedded method content fails.
- A body hash mismatch fails.
- A required external method reference fails.
- One persona validates independently of all other persona files.
- The validation output identifies the file and defect.

**Tests must not:** couple to parser implementation details beyond the documented file format.

---

### Seam H — end-to-end Engineering Manager tracer

**Public interface:** a user-level persona run.

**Observable behavior:**

- Engineering Manager launches through `pi-subagents`.
- It activates all four methods.
- It cannot edit source files.
- It inspects repository evidence.
- It produces the requested engineering-plan artifact.
- It records concrete method evidence.
- It returns a valid attestation.
- Parent acceptance succeeds only when artifact and attestation checks pass.

This is the first end-to-end seam and the primary tracer bullet.

## Confirmation block

Before implementation, the assistant must reproduce the proposed seams and ask the operator to respond with one of:

```text
Confirmed as written.
```

or:

```text
Confirmed with these changes:
- ...
```

Record the confirmed version in `docs/testing/CONFIRMED_SEAMS.md` or the project’s equivalent planning directory.

### Operator confirmation status

- [ ] Seam A confirmed
- [ ] Seam B confirmed
- [ ] Seam C confirmed
- [ ] Seam D confirmed
- [ ] Seam E confirmed
- [ ] Seam F confirmed
- [ ] Seam G confirmed
- [ ] Seam H confirmed

Until these are confirmed, repository inspection and interface design may continue, but no test may be written.
