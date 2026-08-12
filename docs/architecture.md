# Architecture

The package has two Pi extensions and one canonical source format:

- `extensions/persona-parent.ts` registers the thin `persona_team` facade. It validates package agents and reports the installed host's public pi-subagents surface; it never launches a child process or imports pi-subagents internals.
- `extensions/persona-child.ts` resolves `PI_SUBAGENT_CHILD_AGENT`, parses exactly that Markdown file, exposes `persona_contract`, gates actual tool calls, records provider evidence, and writes the host-authored attestation.
- `extensions/internal/` contains generic parser, ledger, role-policy, provider-observer, identity, and attestation mechanics. It contains no persona prose, role-to-method table, or copied method body.

Each `agents/<slug>.md` is independently understandable and independently validatable. Method duplication is intentional and its body hash/provenance are embedded in each file.

## Parent integration boundary

The installed `pi-subagents` 0.31.0 extension exposes a model-callable `subagent` tool and owns child lifecycle internally. It does not expose a documented extension-side delegation or discovery/preflight function. The parent facade therefore has a real compatibility probe and bounded failure path: `list` uses local canonical files, `doctor` reports `model-tool-only`, and `run` refuses to claim acceptance until a host supplies a supported delegation callback. The parent model can use the normal `subagent` tool directly; this package does not create a second launcher or depend on private event names.

## Enforcement boundary

The child extension enforces observable process behavior: activation before substantive calls, role authority, dispositions, provider accounting, and completion. It is not an operating-system sandbox; shell calls still carry the user's permissions.

## Acceptance boundary

Persona compliance and ordinary work acceptance are separate. The pure facade accepts a run only when the canonical identity and method hashes match a passing host attestation and the ordinary pi-subagents acceptance result also passes.
