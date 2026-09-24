# Compatibility

The verified runtime target is:

- Pi coding agent `0.84.4` (peer range `>=0.82.1 <0.85.0`)
- official `pi-subagents` `0.60.0` (peer range `>=0.60.0 <0.61.0`), the same copy pi loads globally; `patches/pi-subagents+0.60.0.patch` matches `~/.pi/agent/npm/patches`
- Bun `1.3.1`

## Executable compatibility probe

Run this against the installed package from the project root:

```bash
node -e 'console.log(require("./node_modules/pi-subagents/package.json").version)'
```

`persona_team.run` uses the installed package's exported `preflight` API and structured delegation event constants. The parent emits a correlated request on `prompt-template:subagent:request` and accepts only the matching terminal response from `prompt-template:subagent:response`. The installed `0.60.0` wire contract does not include a request `version` field.

## Acceptance and digest propagation

The child attestation always binds the persona runtime name, child run ID, and child index. In `pi-subagents` `0.60.0`, the child environment does not expose the launch-contract digest, so the child attestation may omit that optional field. The parent still requires the response digest to equal the digest returned by preflight and records it as `launchContractDigest` in the acceptance receipt. If a child attestation includes a digest, it must equal the response digest as well. The real event-bridge integration test covers this installed-package shape.

## Current-attempt attestation binding

The parent captures a wall-clock `Date.now()` attempt start immediately before dispatch. The facade requires the attestation `issuedAt` to be at or after that timestamp and, for persisted attestations, requires the file `mtime` to be at or after it too. This prevents a prior artifact from being selected again for a reused `runId`/`childIndex`. `requireAttemptBinding` is enabled by default (the parent can disable it only with `PI_PERSONA_REQUIRE_ATTEMPT_BINDING=0`); when enabled, at least one of a matching child launch digest, a nonce echo, or a current `issuedAt` must bind the attestation to the attempt. Freshness remains mandatory even when the digest matches.

The installed `pi-subagents@0.60.0` structured request type is closed: its validator rejects unknown request keys, and its child environment exposes only the standard run/agent/index identity fields. There is no opaque request or environment field that `persona-child.ts` can echo into its ledger/attestation, so this seam cannot transport an attempt nonce. The implementation therefore relies on the timestamp/mtime freshness check and the response launch-contract digest; a future upstream transport that explicitly preserves opaque metadata can add nonce binding.

The package uses the official package-agent manifest key (`pi.subagents.agents`), agent-relative `subagentOnlyExtensions` resolution, omitted restrictive `tools:`/`extensions:` fields for normal Pi capability inheritance, inherited skill discovery, and bounded agent timeout/turn/tool budgets. Broader compatibility requires a new verification pass when any public upstream contract changes.
