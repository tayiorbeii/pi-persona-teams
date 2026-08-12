# Changelog

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
