# Testing

Tests exercise package validation, public facade behavior, child contract actions, actual role-policy decisions, host attestation verification, provider fallback, discovery, and package gates. External context-mode/jCodeMunch boundaries may be faked; parser, ledger, policy, and attestation remain real.

Run `bun test`, `bun run verify:personas`, `bun run verify:no-shared-corpus`, and `bun run typecheck`.
