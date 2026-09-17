---
name: persona-team
description: Use canonical persona-team agents for bounded expert advice and independent review, with optional strict attestation.
---

# Persona Team

Use one canonical `persona-team.<slug>` agent. `persona_team action=list` and `persona_team action=doctor` are the preflight surface: they list personas and authorities and report provider readiness. `persona_team action=run` starts a bounded child and supports non-blocking `mode: "launch"`, idempotent `runKey` attach, per-call `responseTimeoutMs`, and `verificationPolicy` (`advisory` default; `strict` opt-in); advisory output is useful but explicitly unverified when evidence is incomplete. The plain `subagent` tool remains the alternative path. Do not start a second launcher.

## Bounded dispatch

1. Give each persona one role question, one artifact, or one review boundary. At most two concurrent personas may run; prefer one.
2. Set `responseTimeoutMs` explicitly on every run instead of silently accepting the 10-minute default, and scale it to the role: read-only review and planning 300000-420000; implementation-engineer 420000-600000. The child run deadline is automatically the parent wait minus a 30-second margin, so typed bridge terminals (`timed_out`/`cancelled`) arrive before the parent gives up. If a task plausibly needs more, split it into smaller bounded runs. Keep the package defaults `turnBudget: {"maxTurns":8,"graceTurns":1}` and `toolBudget: {"soft":12,"hard":18,"block":["*"]}`. The single grace turn is for finalization after tools stop. Do not add a `tools` or `extensions` override.
3. Ask for concise findings, supporting evidence, uncertainties, and a recommendation. Use a structured output schema only when a downstream consumer needs it and the chosen launcher supports it; `persona_team` itself returns text output.
4. Ordinary advisory work does not require preliminary status, activation, disposition, or completion receipts. Use `persona_contract.status` when tool visibility matters; never infer child visibility from the parent.
5. For an explicit formal gate, set `verificationPolicy: "strict"`. The parent requests status, method activation before substantive work, dispositions, and `persona_contract.complete`, and validates the resulting evidence. Task instructions request the protocol; they do not grant permissions.
6. In strict workflows require a host-authored `pi.persona-attestation/v1` artifact and ordinary acceptance. Advisory runs may return completed output with warnings, but never treat it as verified; keep writer and reviewer identities independent.
7. Partial or timed-out child transcripts are not evidence. A wait-mode timeout has already asked the bridge to cancel the child, so the attempt is terminal, not ambiguous — follow "After a timeout: check, attach, never blind-retry" before any relaunch.

## Capability check before assignment

1. Before assigning work, run `persona_team {action:"list"}` (per-persona `authority`) and, once per session, `persona_team {action:"doctor"}` (provider readiness). Match the task to the authority, not to the job title.
2. Read-only authorities (`independent-review-read-only`, `planning-read-only`, `strategy-read-only`, `retrospective-read-only`, `release-prepare`) may run only the bounded read-only shell allowlist (ls, rg, grep, git read commands, cat, head, tail, wc, `bun test`, `npm test`, `npm run typecheck`, cargo test/check/clippy/build) and may write only assigned planning or review artifacts.
3. `implementation-engineer` (`implementation-writer`) may additionally edit files inside the assigned workspace and run Cargo execution, repair, and dependency commands. It still cannot start servers, use curl, or run arbitrary interpreters.
4. No canonical persona can drive a browser, start a dev server, install project dependencies, or make network calls: browser/CDP tools are absent from every persona allowlist, and role policy blocks every unknown shell command. If the task needs any of these, do that part in the parent session first and hand the persona only the resulting evidence to assess.
5. If a persona reports `status: "abstained"` or `blocked` citing missing tools, missing environment, or invisible providers, treat that as a routing decision: reassign the environment-dependent part to the parent. Do not re-dispatch the same task to the same persona.

## Fire-and-check: never block the parent on read-only reviewers

1. Launch reviewer personas (`qa-lead`, `staff-reviewer`, `security-officer`, `product-designer`, `founder-ceo`, `engineering-manager`, `devex-lead`, `release-engineer`, `retro-ops-manager`) with `persona_team {action:"run", mode:"launch", runKey:"<stable-key>", responseTimeoutMs:300000..420000}`. Launch returns a handle (`status: "launched"`, `runKey`, and the child `runId` once the bridge reports it) without waiting for the child to finish; only the bridge acceptance ack (about 30 seconds) is awaited. Continue other work or return control immediately.
2. Keep the `runKey` — it is the attach handle. Without an explicit key only the default persona+task digest ties a retry to the original child, and any task rewording breaks that tie.
3. Collect with `persona_team {action:"run", persona, task, runKey, mode:"wait"}`: while the child is in flight this attaches to the same attempt (no duplicate child) and blocks only for the remaining wait window; at terminal it returns completed output with any verification warnings. Keep the same `verificationPolicy` when attaching; advisory and strict requests never share an in-flight run. The attach window closes at terminal: before collecting after a long delay, check `.pi-persona/attestations/` for the runId, because a post-terminal call with the same `runKey` starts a fresh child.
4. A synchronous foreground wait (`mode:"wait"` from the start) is acceptable only for `implementation-engineer` on a small bounded task with an explicit `responseTimeoutMs`, or when the parent genuinely has nothing else to do for the whole window.

## After a timeout: check, attach, never blind-retry

1. A wait-mode timeout reports `timedOut: true` with the child `runId` when the bridge reported one, and the parent has already emitted the bridge cancel, so the child aborts instead of being orphaned. The attempt is terminal — but its partial transcript still is not evidence.
2. Check the bridge terminal status and `.pi-subagents/artifacts/` for that runId before retrying. A missing or failed persona attestation alone does not prove the child failed: ordinary advisory work need not collect receipts.
3. Once cancellation or failure is confirmed, a deliberate relaunch is safe: use a smaller scope and record the new `runKey`/`runId`. Never treat incomplete output as a completed review.
4. Two timeouts on the same persona/task is a routing signal: finish the remaining work in the parent session.

## When the parent does the work itself

Do not dispatch to a persona when any of these hold; run the check inline as the parent:

- the task needs browser automation, a dev server, project dependency installation, curl, or any command outside the persona shell allowlists (no persona has these);
- a read-only persona already abstained citing missing tools or environment;
- the same persona/task already timed out twice;
- the task needs interactive iteration beyond the 8-turn budget or the two-persona concurrency cap;
- the check would take the parent less time than the dispatch ceremony (quick greps, one test file, a config read).

Personas earn their overhead on independent judgment, not receipt ceremony or environment access they do not have.

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
