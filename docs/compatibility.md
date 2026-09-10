# Compatibility

The verified runtime target is:

- Pi coding agent `0.82.1` (peer range `>=0.82.1 <0.85.0`)
- official `pi-subagents` `0.47.1` (peer range `>=0.47.1 <0.48.0`)
- Bun `1.3.1`

## Executable compatibility probe

Run this against the installed package from the project root:

```bash
node -e 'console.log(require("./node_modules/pi-subagents/package.json").version)'
```

`persona_team.run` uses the installed package's exported `preflight` API and structured delegation event constants. The parent emits a correlated request on `prompt-template:subagent:request` and accepts only the matching terminal response from `prompt-template:subagent:response`. The installed `0.47.1` wire contract does not include a request `version` field.

## Acceptance and digest propagation

The child attestation always binds the persona runtime name, child run ID, and child index. In `pi-subagents` `0.47.1`, the child environment does not expose the launch-contract digest, so the child attestation may omit that optional field. The parent still requires the response digest to equal the digest returned by preflight and records it as `launchContractDigest` in the acceptance receipt. If a child attestation includes a digest, it must equal the response digest as well. The real event-bridge integration test covers this installed-package shape.

The package uses the official package-agent manifest key (`pi.subagents.agents`), agent-relative `subagentOnlyExtensions` resolution, omitted restrictive `tools:`/`extensions:` fields for normal Pi capability inheritance, inherited skill discovery, and bounded agent timeout/turn/tool budgets. Broader compatibility requires a new verification pass when any public upstream contract changes.
