---
name: persona-team
description: Use canonical persona-team agents through pi-subagents for bounded role work with independent review and attestation requirements.
---

# Persona Team

Use one canonical `persona-team.<slug>` agent through the normal `subagent` tool. The package's `persona_team` tool only lists and diagnoses readiness; do not start a second launcher.

## Bounded dispatch

1. Give each persona one role question, one artifact, or one review boundary. At most two concurrent personas may run; prefer one.
2. Keep the package defaults unless the task needs smaller limits: `timeoutMs: 600000`, `turnBudget: {"maxTurns":8,"graceTurns":1}`, and `toolBudget: {"soft":12,"hard":18,"block":["*"]}`. The single grace turn is for finalization after tools stop. Do not add a `tools` or `extensions` override: persona definitions intentionally inherit the child's normal Pi registry and ambient settings.
3. Require an explicit object `outputSchema`. Its common envelope must require `toolVisibility`, `status`, `findings`, `evidence`, `risks`, and `next`; add role-specific fields instead of asking for broad prose.
4. The child's first persona tool call must be `persona_contract.status`. The child must copy the returned `toolVisibility.available` names and report whether `octocode-research`, `ponytail`, and `i-have-adhd` are actually visible before substantive work. Parent visibility is not child evidence.
5. Then the child activates every mandatory method, performs the bounded task, records dispositions, and calls `persona_contract.complete`.
6. Require a host-authored `pi.persona-attestation/v1` artifact and ordinary acceptance. Keep writer and reviewer identities independent.
7. Partial or timed-out child transcripts are not evidence. Retry only with a smaller scope and a fresh bounded run.

## Resource routing

- Use context-mode first for broad local context, indexed search, large output, and external document retrieval.
- Use jCodeMunch for repository resolution, symbol/source retrieval, relationships, and impact analysis.
- Use `octocode-research` only for external GitHub or ecosystem evidence. It is a read-only CLI workflow, not an MCP provider. Invoke only `npx -y octocode@18.3.0`; inherited or global skill guidance cannot override this exact-version policy.
- Apply `ponytail` before code changes or implementation recommendations: YAGNI, reuse, platform/stdlib, installed dependencies, then the minimum working diff.
- Apply `i-have-adhd` to keep outputs action-first, numbered, bounded, and visibly complete.
- Pass a skill through the `skill` launch option only after confirming it is discovered. An unavailable optional skill must be reported, not made into a failing preflight requirement.
- If a provider is absent, fails, or cannot represent the operation, use one bounded native fallback and mark the evidence degraded.
- Cargo access follows persona authority rather than a validation-only list. Implementers may use task-required Cargo commands including `run`, `install`, `fmt`, `fix`, `clean`, and dependency updates. Reviewers may run validation and non-source-mutating commands including `run`, `install`, and `clean`, but not mutating `fmt`, `fix`, or dependency updates. Registry/release operations such as `publish`, `yank`, and `owner` remain outside both roles.

Persona Markdown files remain independent canonical sources; do not introduce a shared method corpus or `skillPath` library.
