# Pi Persona Teams: Revised Planning Bundle

**Status:** implementation planning  
**Date:** 2026-08-11  
**Target:** ordinary Pi Coding Agent plus `pi-subagents`  
**Supersedes:** the earlier recommendation to maintain a shared role/method corpus and compile persona agents from it

## Purpose

This bundle defines a general Pi extension package that adds ten strongly constrained persona subagents based on the roles already used in:

- `tayiorbeii/prime-persona-teams`
- `tayiorbeii/paperclip-factory-kit`
- `tayiorbeii/paperclip-factory-kit-hermes`

The package uses `nicobailon/pi-subagents` as its child-agent runtime. It must also coexist cleanly with context-mode and jCodeMunch when those tools are installed in Pi, while remaining functional without either one.

## Revised architectural decision

Each persona agent Markdown file is **independent and self-contained**.

Every agent file contains:

1. Its complete role/persona contract.
2. Its complete authority and tool-use policy.
3. Its complete context-mode and jCodeMunch guidance.
4. A machine-readable enforcement contract.
5. Full copied bodies of every methodology skill assigned to that role.
6. Its completion and evidence requirements.

There is no shared runtime role corpus and no shared runtime method corpus. The same method may be copied into several agent files. Duplication is intentional.

The generic parent and child extensions may share implementation code, schemas, and test utilities, but they must not be the semantic source of truth for any persona or methodology. A persona file must remain understandable without opening another role or method file.

## Non-negotiable decisions

- Do not fork or replace `pi-subagents`.
- Do not create a runtime method library consumed by several agents.
- Do not generate persona agent files from a central role/method corpus.
- Do not make context-mode or jCodeMunch mandatory dependencies.
- Do not expose all methodology content to the parent Pi agent.
- Do not accept a child’s prose claim as proof that it followed its role or methods.
- Do not allow a persona to approve its own work when the role model requires independent review.
- Do not write a horizontal suite of imagined tests before implementing behavior.
- Do not refactor inside the red → green TDD loop.

## Documents and recommended reading order

1. [`01-REVISED-ARCHITECTURE.md`](01-REVISED-ARCHITECTURE.md)  
   Overall system design and authority boundaries.

2. [`02-INDEPENDENT-AGENT-FILE-SPEC.md`](02-INDEPENDENT-AGENT-FILE-SPEC.md)  
   Exact contract for the ten self-contained agent files and their copied methods.

3. [`03-SEAM-CONFIRMATION.md`](03-SEAM-CONFIRMATION.md)  
   Public seams that must be explicitly confirmed before the first test is written.

4. [`04-TDD-WORKING-AGREEMENT.md`](04-TDD-WORKING-AGREEMENT.md)  
   Red → green rules, test quality rules, mocking boundaries, and evidence requirements.

5. [`05-VERTICAL-SLICE-DELIVERY-PLAN.md`](05-VERTICAL-SLICE-DELIVERY-PLAN.md)  
   Tracer-bullet implementation sequence beginning with Engineering Manager.

6. [`06-ENFORCEMENT-RUNTIME-DESIGN.md`](06-ENFORCEMENT-RUNTIME-DESIGN.md)  
   Parent facade, child enforcement extension, ledger, tool gates, and attestations.

7. [`07-CONTEXT-PROVIDER-INTEGRATION.md`](07-CONTEXT-PROVIDER-INTEGRATION.md)  
   context-mode, jCodeMunch, native fallback, and loop prevention.

8. [`08-TEST-MATRIX-AND-ACCEPTANCE-GATES.md`](08-TEST-MATRIX-AND-ACCEPTANCE-GATES.md)  
   Acceptance inventory and CI gates. This is an inventory, not permission to author all tests in advance.

9. [`09-REPOSITORY-AND-PACKAGING-PLAN.md`](09-REPOSITORY-AND-PACKAGING-PLAN.md)  
   Proposed repository layout, package metadata, installation, and maintenance model.

10. [`10-MASTER-IMPLEMENTATION-PROMPT.md`](10-MASTER-IMPLEMENTATION-PROMPT.md)  
    Main prompt to provide to an implementation assistant.

11. [`11-PHASE-1-ENGINEERING-MANAGER-PROMPT.md`](11-PHASE-1-ENGINEERING-MANAGER-PROMPT.md)  
    Standalone prompt for the first end-to-end persona tracer.

12. [`12-PHASE-2-WRITER-REVIEWER-PROMPT.md`](12-PHASE-2-WRITER-REVIEWER-PROMPT.md)  
    Standalone prompt for Implementation Engineer and Staff Reviewer.

13. [`13-PHASE-3-REMAINING-PERSONAS-PROMPT.md`](13-PHASE-3-REMAINING-PERSONAS-PROMPT.md)  
    Standalone prompt for adding the other seven personas one vertical slice at a time.

14. [`14-REVIEW-REFACTOR-AND-RELEASE-PROMPT.md`](14-REVIEW-REFACTOR-AND-RELEASE-PROMPT.md)  
    Separate review/refactoring stage after behavior is green.

15. [`15-SOURCES.md`](15-SOURCES.md)  
    Pinned source references.

## How to use this bundle with an LLM assistant

For a new implementation session, provide the assistant:

- This entire directory.
- The target repository or working tree.
- The master prompt in `10-MASTER-IMPLEMENTATION-PROMPT.md`.

The assistant must first inspect the repository, read `CONTEXT.md` if present, read relevant ADRs, and present the seams from `03-SEAM-CONFIRMATION.md` for confirmation. It may inspect and plan before confirmation, but it must not write a test until the seams are confirmed.

After seam confirmation, the assistant should implement only the first tracer in `11-PHASE-1-ENGINEERING-MANAGER-PROMPT.md`. Later phase prompts should be used only after the previous phase’s acceptance gate passes.

## Definition of a successful package

A successful package lets a Pi parent ask naturally for a persona, for example:

```text
Use the Engineering Manager persona to inspect this repository and produce
a bounded implementation plan. It must apply all of its embedded methods.
```

The resulting child:

- Runs through `pi-subagents`.
- Receives one exact self-contained persona file.
- Activates every mandatory embedded method before substantive work.
- Is blocked from exceeding the role’s authority.
- Uses context-mode and jCodeMunch when available and task-relevant.
- Falls back safely when they are absent or fail.
- Records method dispositions and concrete evidence.
- Produces a host-authored attestation.
- Does not become accepted merely because it claims completion.
