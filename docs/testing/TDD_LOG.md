# TDD evidence log

The seams were confirmed in `docs/testing/CONFIRMED_SEAMS.md` before behavior tests were added. Each implementation increment below records the public behavior and the narrow check used to verify it.

## Cycle 001 — independent persona validation

- Seam: G — self-contained persona validation
- Behavior: every canonical file validates independently and preserves its declared method set.
- Test/check: `bun run verify:personas`
- Red evidence: before the parser existed there was no verification command; the first implementation was driven by the missing public command behavior.
- Green evidence: `bun run verify:personas` passes all ten canonical files and reports each runtime name/count.

## Cycle 002 — activation gate

- Seam: C/D — child contract and tool policy
- Behavior: substantive calls remain blocked until every required method has task-specific activation.
- Test: `test/ledger-policy.test.ts`
- Green evidence: `bun test test/ledger-policy.test.ts`

## Cycle 003 — role authority and dispositions

- Seam: D/C — role policy and completion
- Behavior: Engineering Manager source writes are blocked; each activated method needs one evidenced terminal disposition.
- Test: `test/ledger-policy.test.ts`
- Green evidence: `bun test test/ledger-policy.test.ts`

## Cycle 004 — host attestation

- Seam: E — attestation
- Behavior: only a ledger-generated artifact with bound identity and method hashes can pass verification.
- Test: `test/attestation.test.ts`
- Green evidence: `bun test test/attestation.test.ts`

## Cycle 005 — parent facade and provider baseline

- Seam: B/F — facade and provider resolution
- Behavior: list/doctor work without optional providers; run requires both persona and ordinary acceptance.
- Test: `test/facade-provider.test.ts`
- Green evidence: `bun test test/facade-provider.test.ts`

## Cycle 006 — full persona set and packaging

- Seam: A/G — discovery and package checks
- Behavior: exactly ten canonical independent agents validate and no shared runtime corpus is present.
- Test/check: `bun test` and `bun run verify:no-shared-corpus`
- Green evidence: `bun test` passes 15 tests/97 assertions; `bun run verify:no-shared-corpus` passes.

## Red evidence retained

- The missing-body behavior first failed because positional metadata/body pairing produced the wrong missing-method diagnostic. The parser was changed to match metadata and body tags by ID; the narrow persona-file test then passed.
- The initial typecheck failed because this empty repository had no Node/Bun type declarations. Minimal local declarations and a package-neutral typecheck configuration were added; `bun run typecheck` now passes.
- Installed `pi-subagents` 0.31.0 parses `subagentOnlyExtensions` as a comma-separated frontmatter string rather than a YAML list. Persona frontmatter uses the compatible flat value while retaining the planned field and child extension path.
- Upstream body comparison initially detected 37 mismatches caused by copied nested YAML frontmatter. The one-time normalization removed that frontmatter, recomputed per-body hashes, and the exact comparison now reports 0 mismatches.

## Acceptance audit addendum — verifier and release gates

- Seam: G/A — public persona verification, independent files, and package discovery.
- Behavior: the public verifier rejects malformed contracts, duplicate/extra/missing methods, body-tag/hash errors, unsupported authority, dangling shared references, and empty copied bodies; every canonical persona validates from an isolated file.
- Test: `test/verifier-negative.test.ts`, `test/persona-files.test.ts`.
- Green evidence: 14 verifier-negative tests and 4 independence tests pass.

## Acceptance audit addendum — package and corpus gates

- Seam: A/G — no shared runtime corpus and installable package contents.
- Behavior: forbidden corpus directories, `skillPath`, and non-persona files are rejected in a temporary fixture; the package manifest and `npm pack --dry-run --json` archive expose the runtime and exclude tests/plans/attestations.
- Test: `test/package-gates.test.ts`, `test/verifier-negative.test.ts`.
- Green evidence: package/corpus checks pass; dry-run archive contains the expected runtime files.

## Acceptance audit addendum — host attestation

- Seam: E/H — persisted host attestation and parent verification.
- Behavior: a completed child writes `pi.persona-attestation/v1`; the parent accepts the persisted artifact only when identity, digests, method hashes, evidence, and ordinary acceptance match; reused run identity is rejected.
- Test: `test/e2e-attestation.test.ts`, `test/attestation.test.ts`.
- Green evidence: persisted-attestation and mismatch suites pass.

## Final audit command evidence

- `bun test test/verifier-negative.test.ts test/package-gates.test.ts test/persona-files.test.ts test/attestation.test.ts test/e2e-attestation.test.ts`: 23 tests, 174 assertions, 0 failures.
- `bun test test/*.test.ts --reporter=junit --reporter-outfile=/tmp/pi-full2.xml`: 35 tests, 249 assertions, 0 failures.
- `bun run typecheck`: pass.
- `bun run verify:personas`: 10 independent persona files pass.
- `bun run verify:no-shared-corpus`: pass.

## Remaining evidence gaps

- No test launches a real Pi child process through the installed `pi-subagents` runtime; the end-to-end checks use the public child runtime and injected parent delegation seam.
- Provider tests cover baseline absence and bounded jCodeMunch fallback, but not the full context-mode/jCodeMunch availability/failure permutation matrix.
- Lifecycle rows for async, forked, compaction, resume, worktree, and package reload remain unverified.
- `npm pack --dry-run` verifies package contents, not an actual install/remove/rollback in a clean Pi environment.

## Acceptance follow-up — provider permutations

- Seam: F — deterministic provider availability, relevance, failure, fallback, loop prevention, and status.
- Test: `test/provider-permutations.test.ts`.
- Coverage: neither provider, context-mode only, jCodeMunch only, both providers, explicit non-applicability, one-time redirect/fallback for each provider, and child-ledger `used` status.

## Acceptance follow-up — package install and lifecycle persistence

- Seam: E/H and package installation — an npm-packed artifact installs into an isolated prefix, exposes the runtime files, and rolls back cleanly; success and failure attestations survive disk reload through the public artifact seam.
- Tests: `test/package-install.test.ts`, `test/e2e-attestation.test.ts`.
- External seam intentionally not faked: no live Pi process or installed `pi-subagents` child launch is attempted. Async/fork/compaction/resume/worktree lifecycle behavior remains unverified.

## Final follow-up run

- New owned gap tests: `test/provider-permutations.test.ts`, `test/package-install.test.ts`, and `test/e2e-attestation.test.ts` — 10 tests, 68 assertions, 0 failures.
- Full suite: 53 tests, 405 assertions, 0 failures.
- `bun run verify:personas`: pass for all ten persona files.
- `bun run verify:no-shared-corpus`: pass.
- `bun run typecheck`: **blocked outside this ownership boundary** by `extensions/persona-parent.ts:112`, which references `discoverThroughPiSubagents` without importing it. Per the request, `extensions/**` was not edited.
