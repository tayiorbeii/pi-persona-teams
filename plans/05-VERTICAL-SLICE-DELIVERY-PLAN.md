# Vertical-Slice Delivery Plan

## Execution rule

The stages below are an ordered backlog. They are not permission to write every test in advance.

Within every stage:

```text
one confirmed behavior
→ one failing test
→ minimal implementation
→ green evidence
→ next behavior
```

## Stage 0 — Repository orientation and seam confirmation

### Work

- Read `CONTEXT.md`, ADRs, contribution instructions, and existing test setup.
- Inspect current Pi and `pi-subagents` package APIs.
- Determine package manager and test command.
- Confirm the seams in `03-SEAM-CONFIRMATION.md`.
- Record confirmation.
- Do not write implementation tests before confirmation.

### Exit

- Confirmed seams are committed or stored in the planning area.
- The first tracer’s public interface is explicit.

---

## Stage 1 — One self-contained Engineering Manager file validates

### Tracer 1.1: valid independent file

**Behavior:** the public validation command accepts one complete Engineering Manager file with four embedded methods.

**Red:** add the fixture or canonical file and a failing validation-command test.

**Minimal green:** implement only enough command plumbing and parsing to validate the required contract and method markers.

### Tracer 1.2: missing embedded body

**Behavior:** validation fails when a required method is named but not copied into the file.

### Tracer 1.3: body hash mismatch

**Behavior:** validation fails with the file name and method ID.

### Tracer 1.4: independence

**Behavior:** Engineering Manager still validates when no other persona files exist in the fixture package.

### Stage exit

- Engineering Manager is fully self-contained.
- There is no shared method directory.
- `verify:personas` provides useful results.

---

## Stage 2 — Package discovery through `pi-subagents`

### Tracer 2.1: canonical runtime identity

**Behavior:** package discovery exposes `persona-team.engineering-manager`.

### Tracer 2.2: expected launch fields

**Behavior:** preflight resolves the child-only enforcement extension and expected context/tool posture.

### Tracer 2.3: shadowing is visible

**Behavior:** a project agent with the same runtime name is detected by the parent doctor or preflight policy.

### Stage exit

- One persona is discoverable through the real runtime seam.
- No custom launcher exists.

---

## Stage 3 — Child contract status

### Tracer 3.1: child identity

**Behavior:** a launched Engineering Manager child receives `persona_contract`.

### Tracer 3.2: exact required methods

**Behavior:** `persona_contract.status` returns the four IDs parsed from the independent file.

Expected literal set:

```text
persona-team-domain-driven-design
persona-team-system-design
persona-team-ddia-systems
persona-team-clean-architecture
```

### Tracer 3.3: invalid file prevents admission

**Behavior:** the child fails closed if its own file cannot be parsed or its body hashes do not match.

### Stage exit

- Generic enforcement reads semantic content from the selected agent file.
- No extension registry duplicates method lists.

---

## Stage 4 — Activation gate

### Tracer 4.1: substantive read blocked

**Behavior:** a repository read before activation is blocked and names the missing methods.

### Tracer 4.2: activation requires planned application

**Behavior:** empty or generic activation input is rejected according to the documented public contract.

### Tracer 4.3: unknown method rejected

**Behavior:** a method not embedded in this file cannot be activated.

### Tracer 4.4: partial activation remains blocked

**Behavior:** activating one of four methods does not admit substantive work.

### Tracer 4.5: complete activation admits permitted reads

**Behavior:** once all four methods are activated, a permitted repository-inspection tool can execute.

### Stage exit

- Method activation is a real gate.
- The full copied method bodies were already present in the system prompt.
- No skill-loading path exists.

---

## Stage 5 — Engineering Manager role authority

### Tracer 5.1: source write blocked

**Behavior:** `write` or `edit` against implementation files is blocked.

### Tracer 5.2: mutating shell command blocked

**Behavior:** an obvious repository mutation is blocked.

### Tracer 5.3: read-only validation allowed

**Behavior:** a non-mutating command needed for planning evidence is permitted.

### Tracer 5.4: supervisor escalation allowed

**Behavior:** the child can report missing evidence or ambiguous authority.

### Stage exit

- Engineering Manager cannot become an implementation agent.
- Blocks are observable through actual tool calls.

---

## Stage 6 — Method dispositions and completion

### Tracer 6.1: missing disposition

**Behavior:** completion fails when any method lacks a disposition.

### Tracer 6.2: valid applied evidence

**Behavior:** `applied` requires concrete evidence tied to an artifact, decision, or tool result.

### Tracer 6.3: valid non-applicability

**Behavior:** `not_applicable` requires a task-specific justification.

### Tracer 6.4: one terminal disposition

**Behavior:** a method cannot have conflicting terminal states.

### Tracer 6.5: bounded repair

**Behavior:** incomplete completion receives at most the configured corrective turns, then fails terminally.

### Stage exit

- Completion cannot be achieved by prose alone.
- All four methods are accounted for.

---

## Stage 7 — Host-authored attestation

### Tracer 7.1: successful schema

**Behavior:** a complete ledger produces `pi.persona-attestation/v1`.

### Tracer 7.2: identity binding

**Behavior:** the attestation includes and matches child agent, run ID, child index, contract digest, and embedded method hashes.

### Tracer 7.3: child prose cannot forge it

**Behavior:** JSON in the child’s final text is not accepted as the host attestation.

### Tracer 7.4: policy violation remains visible

**Behavior:** a blocked prohibited action is represented in the attestation.

### Stage exit

- Compliance is host-authored and machine-readable.

---

## Stage 8 — Parent persona facade

### Tracer 8.1: list

**Behavior:** `persona_team.list` reports Engineering Manager.

### Tracer 8.2: doctor

**Behavior:** `persona_team.doctor` reports readiness and provider availability.

### Tracer 8.3: run delegates through `pi-subagents`

**Behavior:** the facade uses the supported delegation seam and does not spawn Pi independently.

### Tracer 8.4: failed attestation rejected

**Behavior:** output from a noncompliant child is returned as failed evidence, not accepted work.

### Tracer 8.5: dual acceptance

**Behavior:** overall success requires both a passing persona attestation and task acceptance.

### Stage exit

- Engineering Manager is usable as one end-to-end persona.

---

## Stage 9 — context-mode behavior

Implement only after the no-provider baseline is green.

### Tracers

1. Absence does not prevent launch.
2. Availability is reported.
3. Relevant large-content work records context-mode use.
4. Valid non-use reason is accepted for an irrelevant task.
5. Provider failure permits one bounded fallback.
6. Repeated native redirect loop is prevented.
7. Provider status appears in the attestation.

---

## Stage 10 — jCodeMunch behavior

### Tracers

1. Absence does not prevent launch.
2. Availability is reported.
3. Engineering Manager code orientation uses a structural/code retrieval capability.
4. Valid non-use is possible for a non-code planning task.
5. Failure permits bounded native fallback.
6. Native broad code exploration can be redirected once when the provider is healthy.
7. Provider status appears in the attestation.

---

## Stage 11 — Complete Engineering Manager end-to-end run

### User-level behavior

Given a bounded planning task and fixture repository:

- The persona launches.
- All four methods are activated.
- Repository evidence is collected.
- No source edits occur.
- A plan artifact is produced.
- Every method receives evidence or a valid non-applicability disposition.
- The attestation passes.
- The artifact gate passes.

This is the first phase acceptance gate.

---

## Stage 12 — Implementation Engineer

Add one complete independent file with four copied method bodies.

Vertical behaviors:

- File validation and discovery.
- Exact method status.
- Activation gate.
- Bounded write authority.
- Workspace-path restriction.
- Test/build evidence.
- Attestation.
- End-to-end implementation tracer.

Do not generalize Engineering Manager policy until a real difference is encountered.

---

## Stage 13 — Staff Reviewer

Add one complete independent file with four copied method bodies.

Vertical behaviors:

- Independent read-only authority.
- Candidate change inspection.
- No self-approval.
- Structured findings.
- Separate reviewer identity from writer.
- Attestation and ordinary acceptance.

---

## Stage 14 — Remaining personas

Add one persona at a time in this order:

1. Security Officer.
2. QA Lead.
3. Product Designer.
4. DevEx Lead.
5. Founder & CEO.
6. Release Engineer.
7. Retro / Ops Manager.

For each:

```text
self-contained file validation
→ discovery
→ method activation
→ role authority
→ dispositions
→ attestation
→ one end-to-end task
```

Do not create all seven files and all tests as one batch.

---

## Stage 15 — Review and refactoring

After all planned behavior is green:

- Run independent code review.
- Refactor generic enforcement code only where tests demonstrate stable seams.
- Keep persona files independent.
- Keep copied method bodies in every relevant file.
- Run the complete acceptance suite.
- Prepare installation and rollback documentation.
