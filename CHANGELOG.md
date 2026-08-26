# Changelog

## Unreleased

### Official pi-subagents integration

- Switched the compatibility floor to official `pi-subagents` 0.51 and documented merged PR #1251; official `main` is required until the post-merge npm release.
- Made all canonical personas inherit Pi's normal builtin tools, ambient extensions, project context, and discovered skills by omitting restrictive `tools:`/`extensions:` frontmatter; added `fffind`/`ffgrep` role-policy coverage while retaining trusted provider detection and mandatory first-call child tool visibility reporting.
- Added inherited skill discovery and explicit `octocode-research`, `ponytail`, and `i-have-adhd` routing rules without making optional user skills hard preflight dependencies.
- Added 10-minute child timeouts, aligned the parent delegation response deadline to the same 10-minute budget, eight-turn execution plus one finalization grace turn, and 18-call hard tool budgets; partial or timed-out transcripts are not evidence.
- Allowed `structured_output` as a substantive finalization operation after every mandatory method activates, preserving all write and shell boundaries.
- Allowed only read-only Octocode CLI research commands pinned to `octocode@18.3.0`; mutable versions, cloning, local-file operations, and unrelated `npx` execution remain blocked.
- Made Cargo shell access authority-aware instead of validation-only: implementers can run task-required execution, setup, formatting, repair, cleanup, and dependency commands; reviewers can run validation and non-source-mutating execution/setup commands. Registry/release operations and reviewer source mutation remain blocked.

## 0.1.1

### Security and enforcement

- Hardened shell and structured-write policy against compound-command, interpreter, traversal, symlink, protected-state, and provider-name bypasses.
- Made provider routing host-observed, provenance-aware, correlated, and limited to a single fallback after an observed failure.
- Added strict persisted-ledger and attestation validation with collision-resistant atomic writes and fail-closed launch-contract binding.

### Compatibility and verification

- Made persona discovery and doctor checks validate all ten canonical personas and fail closed when the supported pi-subagents seam is unavailable.
- Added adversarial parent-verification, persistence, provider-runtime, and role-policy suites.
- Verified the packed package in an isolated Pi `0.82.1` host with `pi-subagents` `0.47.1`: all ten preflights, package list, and doctor passed.

## 0.1.0

### Persona and methods

- Added ten independent persona agent files with copied, provenance-tracked methodology bodies.
- Added upstream drift reporting and exact body-hash validation.

### Runtime and attestation

- Added generic child activation, role-policy, bounded provider fallback, persisted ledger, and host-authored attestation runtime.
- Added parent discovery/doctor/run facade with pi-subagents preflight and delegation seams.

### Compatibility and verification

- Supports Pi `0.82.x` and pi-subagents `0.31.x` through `0.47.x`.
- Added package, provider-permutation, lifecycle, negative-verifier, and isolated install/rollback checks.
