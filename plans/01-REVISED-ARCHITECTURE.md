# Revised Architecture

## 1. Goal

Build a regular Pi package, tentatively named `pi-persona-teams`, that supplies ten strongly role-bound subagents through `pi-subagents`.

The package must combine:

- Ordinary Pi package installation.
- `pi-subagents` child process execution.
- Self-contained persona Markdown files.
- Generic runtime enforcement.
- Optional context-mode and jCodeMunch integration.
- Test-driven implementation through public seams.

## 2. Core architectural rule

**Copy, do not compose.**

Each persona file owns its complete semantic content. It does not import, include, or look up role text or methodology text from another file at runtime.

The following are intentionally duplicated between agents:

- A role’s complete method bodies.
- Shared operating rules when they are necessary to understand that role.
- Context-provider instructions.
- Completion requirements.
- Authority language.

A method used by Engineering Manager and Security Officer appears in both files. Those copies may later diverge if role-specific application warrants it.

## 3. System overview

```text
Parent Pi session
│
├── pi-subagents
│   ├── discovery, launch, contexts, models, worktrees
│   ├── async execution, missions, status, resume
│   └── ordinary acceptance gates
│
├── pi-persona-teams parent extension
│   ├── persona_team list / doctor / run
│   ├── canonical-agent preflight
│   ├── launch through pi-subagents public API
│   └── attestation verification
│
└── Child Pi process
    ├── one self-contained persona Markdown file
    │   ├── complete role contract
    │   ├── machine-readable policy
    │   ├── full copied method bodies
    │   └── completion/evidence rules
    │
    ├── generic persona child extension
    │   ├── parses this exact agent file
    │   ├── registers persona_contract
    │   ├── gates tools by role and method state
    │   ├── records provider use and evidence
    │   └── emits pi.persona-attestation/v1
    │
    ├── normal Pi tools
    ├── context-mode when installed
    └── jCodeMunch when installed
```

## 4. Responsibilities

### `pi-subagents`

`pi-subagents` remains authoritative for:

- Agent discovery.
- Child Pi process spawning.
- Fresh and forked context.
- Models and thinking levels.
- Foreground and asynchronous execution.
- Worktrees.
- Missions and schedules.
- Spawn and runtime budgets.
- Status, steering, interruption, and resume.
- Host-run acceptance commands.
- General child lifecycle artifacts.

The persona package must use supported `pi-subagents` APIs rather than duplicate them.

### Parent persona extension

The parent extension is a policy facade, not a second child runtime.

It should:

- Register `persona_team`.
- List the ten canonical personas.
- Run `pi-subagents` preflight.
- Verify that the selected package agent has not been shadowed unexpectedly.
- Verify that the child enforcement extension is in the resolved launch contract.
- Launch the persona through the structured delegation API or another public `pi-subagents` seam.
- Correlate the child run with its attestation.
- Reject missing, malformed, mismatched, or failed attestations.
- Combine persona compliance with ordinary `pi-subagents` acceptance results.

### Child persona extension

The child extension is generic. It must not contain role prose or method content.

It should:

- Read `PI_SUBAGENT_CHILD_AGENT`.
- Resolve the corresponding agent Markdown file by convention.
- Parse that file’s embedded machine-readable contract.
- Parse the list and hashes of embedded methods.
- Register the `persona_contract` tool.
- Block substantive tools until mandatory methods are activated.
- Enforce role authority on tool calls.
- Record method dispositions and evidence.
- Detect context providers and record their use.
- Emit a host-authored attestation.

### Persona Markdown file

The persona file is the canonical source for:

- Role identity.
- Mission.
- Responsibilities.
- Non-responsibilities.
- Inputs and outputs.
- Decision and escalation rules.
- Tool authority.
- Context policy.
- Mandatory methods.
- Full method contents.
- Completion standard.

## 5. Strong enforcement and its limits

No extension can prove an LLM’s private mental state. It can enforce observable behavior:

1. An exact role file is selected.
2. The child sees the full role and method content.
3. Every mandatory method must be activated.
4. Substantive tools remain unavailable until activation is complete.
5. Prohibited tool calls are blocked.
6. Every method receives one terminal disposition.
7. Completion is rejected when the ledger is incomplete.
8. A host-authored attestation is required.
9. Parent acceptance requires both persona compliance and work evidence.

This is a process and policy boundary. It is not an operating-system sandbox. Shell access still carries the user’s machine permissions.

## 6. Canonical personas

| Runtime name | Primary authority | Mandatory copied methods |
|---|---|---|
| `persona-team.founder-ceo` | Strategic framing and prioritization | inspired-product; jobs-to-be-done; blue-ocean-strategy; lean-startup |
| `persona-team.product-designer` | Product experience and acceptance contract | inspired-product; jobs-to-be-done; mom-test; lean-ux; continuous-discovery; design-sprint; ux-heuristics |
| `persona-team.devex-lead` | API, CLI, SDK, and contributor experience | pragmatic-programmer; system-design; high-perf-browser; web-typography |
| `persona-team.engineering-manager` | Technical plan and ordered build queue | domain-driven-design; system-design; ddia-systems; clean-architecture |
| `persona-team.implementation-engineer` | Bounded candidate implementation | clean-code; refactoring-patterns; software-design-philosophy; pragmatic-programmer |
| `persona-team.staff-reviewer` | Independent correctness and maintainability review | clean-code; clean-architecture; refactoring-patterns; software-design-philosophy |
| `persona-team.security-officer` | Independent threat and security review | clean-architecture; ddia-systems; domain-driven-design |
| `persona-team.qa-lead` | Independent acceptance and regression validation | pragmatic-programmer; release-it; ux-heuristics |
| `persona-team.release-engineer` | Reversible release preparation and approved execution | release-it |
| `persona-team.retro-ops-manager` | Retrospective learning and improvement proposals | traction-eos; drive-motivation; pragmatic-programmer |

Method IDs in files should retain the `persona-team-` prefix.

## 7. Launch modes

### Ordinary discovery mode

The persona files are package agents and appear in normal `pi-subagents` listings. A user or parent agent can select them by canonical name.

This mode still receives child-side enforcement. The child cannot bypass activation or role policy merely because it was launched through the ordinary `subagent` tool.

### Authoritative facade mode

`persona_team.run` performs preflight, launches through `pi-subagents`, and verifies the returned attestation.

This is the recommended mode when downstream workflow state depends on persona compliance.

## 8. Persona compliance versus work acceptance

These are separate dimensions.

### Persona compliance proves

- Correct role file.
- Correct embedded method set.
- All methods activated.
- All dispositions recorded.
- No unresolved role-policy violations.
- Provider behavior accounted for.
- Valid attestation.

### Work acceptance proves

- Required artifact exists.
- Tests or checks pass.
- Output meets task-specific criteria.
- Independent review occurs when required.
- Release approval exists when required.

A run fails overall when either dimension fails.

## 9. Provider model

The package runs without context-mode and jCodeMunch.

When available:

- context-mode is preferred for large documents, command output, web/content retrieval, and context continuity.
- jCodeMunch is preferred for code structure, symbol retrieval, references, importers, blast radius, and targeted source reads.
- Native Pi tools remain the fallback and the execution/editing substrate.

Provider absence is not failure by itself. Silent bypass of an available, task-relevant provider is a persona evidence failure unless the child records a valid reason.

## 10. Explicitly rejected designs

- One shared `roles/` directory compiled into agents.
- One shared `methods/` directory loaded through `skillPath`.
- Runtime inclusion of method files.
- A generated agent directory treated as disposable output.
- A central manifest as the semantic source of truth.
- A fork of `pi-subagents`.
- A second worktree, mission, or async runtime.
- Hard dependency on context-mode or jCodeMunch.
- Prompt-only method compliance with no runtime ledger.
