# Enforcement Runtime Design

## 1. Design constraint

The enforcement runtime is generic. It must derive each role’s semantic contract from the selected persona Markdown file.

It must not contain:

- Role prose.
- Role-to-method arrays.
- Embedded method bodies.
- A shared persona catalog that overrides the files.
- A central method manifest used as runtime truth.

## 2. Child identity resolution

`pi-subagents` provides child metadata through environment variables, including the canonical child agent name, run ID, and child index.

The child extension should:

1. Read the canonical runtime agent name.
2. Require prefix `persona-team.`.
3. Convert the remaining safe slug to `agents/<slug>.md`.
4. Resolve the path relative to the installed package.
5. Reject path traversal or an unknown slug.
6. Parse the exact file.
7. Verify that the contract’s runtime name matches the environment.

No hard-coded role registry is needed.

## 3. Persona-file parser

The parser reads:

- Standard YAML frontmatter.
- One `pi-persona-contract:v1` comment.
- Each `pi-persona-method:v1` metadata comment.
- The paired `<pi-persona-method-body>` block.
- Completion sections needed only for diagnostics, not policy duplication.

Validation:

- One contract only.
- Valid schema version.
- Safe role slug.
- Runtime name match.
- Unique required method IDs.
- Unique embedded method IDs.
- Required and embedded sets are identical.
- Method metadata ID matches body tag ID.
- Body hash matches.
- Supported authority category.
- Supported provider policy.
- Supported disposition set.

## 4. `persona_contract` public tool

Suggested operations:

### `status`

Input:

```json
{ "action": "status" }
```

Output:

- Role identity.
- Authority category.
- Required method IDs.
- Activation state.
- Disposition state.
- Provider status.
- Remaining deficiencies.
- Repair-turn count.

### `activate`

Input:

```json
{
  "action": "activate",
  "method": "persona-team-system-design",
  "plannedApplication": "Use capacity estimates and explicit reliability tradeoffs in the architecture plan."
}
```

Rules:

- Method must be required by this persona.
- It may be activated once.
- Planned application must be task-specific.
- Activation is recorded by the extension, not inferred from prose.
- The response confirms the method’s internal hash and activation state.

The full method body is already in the agent system prompt. The tool does not load a shared skill.

### `disposition`

Input:

```json
{
  "action": "disposition",
  "method": "persona-team-system-design",
  "disposition": "applied",
  "evidence": [
    {
      "kind": "artifact-section",
      "path": "docs/architecture.md",
      "locator": "Capacity and scaling assumptions",
      "summary": "Estimated write rate, peak concurrency, and queue depth."
    }
  ]
}
```

Rules:

- Method must be activated.
- Exactly one terminal disposition.
- `applied` requires concrete evidence.
- `not_applicable` requires a specific justification.
- Evidence is bounded and structured.

### `complete`

Input:

```json
{
  "action": "complete",
  "outputSummary": "Produced the requested engineering plan."
}
```

Rules:

- All methods activated.
- All methods disposed.
- No unresolved role-policy violation.
- Required output contract satisfied or separately represented as pending ordinary acceptance.
- Provider obligations accounted for.
- Generates or finalizes the host attestation.

## 5. Ledger state

Suggested state:

```typescript
type PersonaLedger = {
  schema: "pi.persona-ledger/v1";
  runtimeName: string;
  role: string;
  runId: string;
  childIndex: number;
  contractDigest: string;
  authority: AuthorityCategory;
  methods: Record<string, {
    bodySha256: string;
    activatedAt?: string;
    plannedApplication?: string;
    disposition?: "applied" | "not_applicable";
    evidence?: PersonaEvidence[];
    justification?: string;
  }>;
  providers: {
    contextMode: ProviderLedger;
    jcodemunch: ProviderLedger;
    native: ProviderLedger;
  };
  policyEvents: PolicyEvent[];
  repairTurns: number;
  completionStatus: "open" | "passed" | "failed";
};
```

Persist enough state to survive child retries or compaction according to Pi lifecycle semantics. Do not rely exclusively on model-visible conversation text.

## 6. Pre-activation tool gate

Before every required method is activated, permit only:

- `persona_contract`.
- Supervisor/escalation communication.
- Provider availability or bootstrap operations that are required before the first turn.
- Internal protocol tools required by Pi or `pi-subagents`.
- A narrowly justified non-substantive operation explicitly documented by the contract.

Block:

- Repository reads.
- Code search.
- Document research.
- Shell commands.
- Writes and edits.
- Web retrieval.
- Subagent fanout.

The block message should list missing methods and the required corrective action.

## 7. Role authority gate

After activation, the extension evaluates actual tool calls.

### Read-only planning roles

Allow:

- Bounded reading and search.
- context-mode retrieval.
- jCodeMunch retrieval.
- Non-mutating validation commands.
- Writing only to explicitly assigned planning artifact paths when the role requires an artifact and the parent contract authorizes it.

Block:

- Source-code edits.
- Git mutations.
- Dependency changes.
- Deployments.
- Self-approval.

### Implementation writer

Allow:

- Reads and structural retrieval.
- Writes inside assigned workspace and scope.
- Build/test/lint commands.
- Index refresh after edits.
- Candidate artifact creation.

Block:

- Out-of-scope paths.
- Release/deployment unless separately authorized.
- Approval of its own implementation.
- Modification of persona or enforcement files during a normal product task.

### Independent reviewers

Allow:

- Candidate inspection.
- Tests or read-only validation.
- Review artifacts.

Block by default:

- Editing the candidate.
- Approving their own earlier implementation.
- Release actions.

### Release preparation

Allow:

- Release plan and reversible preparation.
- Verification of an approved action.

Require parent-side explicit approval for irreversible release execution.

## 8. Tool classification

Use structured tool identity and arguments where possible.

For shell commands:

- Parse conservatively.
- Maintain explicit read-only and mutating command categories.
- Treat unknown commands as requiring escalation for read-only roles.
- Never claim that string classification is a security sandbox.
- Record blocked attempts.

Do not disable context-mode’s own routing protections. The persona extension should add role constraints, not replace provider-specific safety.

## 9. Provider evidence

The extension should observe provider tool calls and record:

- Availability.
- Whether provider use was required for the task.
- Successful uses.
- Failures.
- Fallback permission.
- Native fallback uses.
- Degraded status.
- One-time redirect state.

Provider-specific semantics are in `07-CONTEXT-PROVIDER-INTEGRATION.md`.

## 10. Completion repair

When the child attempts to finish with deficiencies:

1. Reject completion.
2. Return a bounded list of exact missing items.
3. Permit a corrective continuation.
4. Increment repair count.
5. After the configured maximum, finalize as failed.

Correction should target only unresolved deficiencies. It must not restart the whole task.

## 11. Attestation

Suggested shape:

```json
{
  "schema": "pi.persona-attestation/v1",
  "status": "passed",
  "runtimeName": "persona-team.engineering-manager",
  "role": "engineering-manager",
  "runId": "run-123",
  "childIndex": 0,
  "contractDigest": "sha256:...",
  "agentFileDigest": "sha256:...",
  "methods": [
    {
      "id": "persona-team-system-design",
      "bodySha256": "...",
      "activated": true,
      "plannedApplication": "...",
      "disposition": "applied",
      "evidence": []
    }
  ],
  "providers": {
    "contextMode": {
      "availability": "available",
      "status": "used"
    },
    "jcodemunch": {
      "availability": "available",
      "status": "used"
    }
  },
  "policy": {
    "blockedCalls": 0,
    "unresolvedViolations": 0,
    "repairTurns": 0
  },
  "issuedAt": "2026-08-11T00:00:00Z"
}
```

The extension writes this from its ledger. The child cannot provide the authoritative object as final prose.

## 12. Parent verification

The parent facade verifies:

- Schema.
- Passing status.
- Runtime agent identity.
- Run ID and child index.
- Launch/preflight contract digest.
- Agent file digest.
- Complete required method set.
- Body hashes.
- Activation and disposition state.
- Provider obligations.
- No unresolved violations.
- Task acceptance result.

A mismatch is failure, not a warning.

## 13. Direct ordinary subagent launches

Child-side enforcement applies regardless of parent facade.

For a direct ordinary `subagent` launch:

- The child still gates methods and tools.
- The child still emits an attestation.
- The result may include an attestation pointer.

The parent facade remains the stronger path because it verifies the attestation before returning accepted persona evidence.
