# Architecture

The package has two Pi extensions and one canonical source format:

- `extensions/persona-parent.ts` registers the thin `persona_team` facade. It validates package agents and reports the installed host's public pi-subagents surface; it never launches a child process or imports pi-subagents internals.
- `extensions/persona-child.ts` resolves `PI_SUBAGENT_CHILD_AGENT`, parses exactly that Markdown file, exposes `persona_contract`, reports the bound child tool registry on the mandatory first `status` call, gates actual tool calls, records provider evidence, and writes the host-authored attestation.
- `extensions/internal/` contains generic parser, ledger, role-policy, provider-observer, identity, and attestation mechanics. It contains no persona prose, role-to-method table, or copied method body.

Each `agents/<slug>.md` is independently understandable and independently validatable. Method duplication is intentional and its body hash/provenance are embedded in each file.

## Parent integration boundary

Official `pi-subagents` 0.51 exposes public preflight APIs, a model-callable `subagent` tool, strict direct-MCP tool planning, skills, and agent-level budgets while retaining ownership of child lifecycle. Merged PR #1251 resolves this package's relative child extension against the defining agent file. The parent facade keeps a bounded compatibility boundary: `list` uses local canonical files, `doctor` reports readiness, and `run` refuses to claim acceptance until a host supplies a supported delegation callback. The parent model uses the normal `subagent` tool directly; this package does not create a second launcher or depend on private event names.

## Enforcement boundary

Agent definitions omit `tools:` and `extensions:` so each child inherits Pi's normal builtin tools, configured settings, and ambient extension registry instead of a package-maintained snapshot. The child extension then enforces observable process behavior at call time: activation before substantive calls, role authority, dispositions, provider accounting, and completion. It is not an operating-system sandbox; shell calls still carry the user's permissions.

## Acceptance boundary

Persona compliance and ordinary work acceptance are separate. The pure facade accepts a run only when the canonical identity and method hashes match a passing host attestation and the ordinary pi-subagents acceptance result also passes.
