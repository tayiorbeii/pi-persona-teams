# Architecture

The package has two Pi extensions and one canonical source format:

- `extensions/persona-parent.ts` registers the thin `persona_team` facade. It validates package agents and reports the installed host's public pi-subagents surface; it never launches a child process or imports pi-subagents internals.
- `extensions/persona-child.ts` resolves `PI_SUBAGENT_CHILD_AGENT`, parses exactly that Markdown file, exposes `persona_contract`, reports the bound child tool registry on an optional `status` call, gates actual tool calls, records provider evidence, and writes the host-authored attestation.
- `extensions/internal/` contains generic parser, ledger, role-policy, provider-observer, identity, and attestation mechanics. It contains no persona prose, role-to-method table, or copied method body.

Each `agents/<slug>.md` is independently understandable and independently validatable. Method duplication is intentional and its body hash/provenance are embedded in each file.

## Parent integration boundary

Official `pi-subagents` 0.51 exposes public preflight APIs, a model-callable `subagent` tool, strict direct-MCP tool planning, skills, and agent-level budgets while retaining ownership of child lifecycle. Merged PR #1251 resolves this package's relative child extension against the defining agent file. The parent facade keeps a bounded compatibility boundary: `list` uses local canonical files, `doctor` reports readiness, and `run` refuses to claim acceptance until a host supplies a supported delegation callback. The parent model uses the normal `subagent` tool directly; this package does not create a second launcher or depend on private event names.

## Enforcement boundary

Agent definitions declare their tool allowlists and child extension. The child runtime provides expertise by default without status or activation prerequisites, while enforcing role authority, provider routing, and workspace/shell policy. Formal receipt collection remains available through `persona_contract`; its completion validator is unchanged. A strict parent request adds protocol guidance to the task and checks evidence at acceptance time. That text does not change child permissions or carry a trusted runtime policy; no private bridge field or environment flag is needed. It is not an operating-system sandbox; shell calls still carry the user's permissions.

## Acceptance boundary

Persona compliance and ordinary work acceptance are separate. `persona_team` defaults to advisory verification: completed output may be returned with warnings but `accepted`, `ordinaryAccepted`, and `personaAccepted` remain truthful. Strict opt-in accepts a run only when canonical identity and method hashes match a passing host attestation and ordinary pi-subagents acceptance also passes.
