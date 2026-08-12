# Confirmed public seams

The implementation request to deliver the planned vertical slices is recorded as operator confirmation of the proposed seams in `plans/03-SEAM-CONFIRMATION.md`.

- **A — package discovery:** canonical `pi-subagents` discovery and preflight expose package agents and reject malformed/shadowed selections.
- **B — persona facade:** `persona_team` provides `list`, `doctor`, and `run`; accepted output requires persona and ordinary acceptance.
- **C — child contract:** launched children expose `persona_contract` status, activation, disposition, and completion.
- **D — child tool policy:** actual tool calls are gated before activation and by role authority; provider fallback is bounded.
- **E — attestation:** host-authored `pi.persona-attestation/v1` binds identity, contract, methods, providers, and policy events.
- **F — providers:** context-mode and jCodeMunch are optional; availability, use/non-use, failure, and bounded fallback are observable.
- **G — independent files:** `verify:personas` validates each canonical file independently, including exact copied method bodies and hashes.
- **H — Engineering Manager tracer:** a user-level run activates four methods, inspects evidence, cannot edit source, writes a plan artifact, and passes dual acceptance.

## Acceptance evidence map

- **A/G:** `test/discovery.test.ts`, `test/persona-files.test.ts`, `test/verifier-negative.test.ts`, and `test/package-gates.test.ts` cover canonical identity, isolated validation, verifier negatives, no-shared-corpus, and package archive contents.
- **B/E:** `test/facade-provider.test.ts`, `test/attestation.test.ts`, and `test/e2e-attestation.test.ts` cover dual acceptance, host-authored persisted attestations, digest/method-set mismatches, and reused run identity.
- **C/D:** `test/ledger-policy.test.ts`, `test/e2e-engineering-manager.test.ts`, and `test/writer-reviewer.test.ts` cover activation, role gates, bounded completion, and writer/reviewer authority.
- **F:** deterministic provider permutations, explicit non-applicability, bounded failure fallback, loop prevention, and status propagation are covered by `test/provider-permutations.test.ts` and `test/facade-provider.test.ts`.

## Explicit limitations

The current evidence uses the public child runtime and the public `pi-subagents/preflight` plus `pi-subagents/delegation` seams when available, with an injected facade seam for deterministic tests. The isolated package installation reached Pi startup, but a real model-backed child process was not executed because the isolated test had no provider API key. The full async/fork/compaction/resume/worktree lifecycle matrix remains unverified. Provider permutations are deterministic observer/ledger checks; no live external provider is faked or contacted.
