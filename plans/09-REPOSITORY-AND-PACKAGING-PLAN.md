# Repository and Packaging Plan

## 1. Proposed repository

Tentative name:

```text
tayiorbeii/pi-persona-teams
```

This should be a separate ordinary Pi package rather than a runtime mode inside `prime-persona-teams`.

## 2. Proposed layout

```text
pi-persona-teams/
├── package.json
├── README.md
├── CHANGELOG.md
├── LICENSE
│
├── agents/
│   ├── founder-ceo.md
│   ├── product-designer.md
│   ├── devex-lead.md
│   ├── engineering-manager.md
│   ├── implementation-engineer.md
│   ├── staff-reviewer.md
│   ├── security-officer.md
│   ├── qa-lead.md
│   ├── release-engineer.md
│   └── retro-ops-manager.md
│
├── extensions/
│   ├── persona-parent.ts
│   ├── persona-child.ts
│   └── internal/
│       ├── persona-file.ts
│       ├── ledger.ts
│       ├── role-policy.ts
│       ├── attestation.ts
│       ├── child-identity.ts
│       ├── provider-observer.ts
│       └── providers/
│           ├── context-mode.ts
│           ├── jcodemunch.ts
│           └── native.ts
│
├── skills/
│   └── persona-team/
│       └── SKILL.md
│
├── schemas/
│   ├── persona-contract.v1.json
│   ├── persona-ledger.v1.json
│   └── persona-attestation.v1.json
│
├── scripts/
│   ├── verify-personas.ts
│   ├── verify-no-shared-corpus.ts
│   ├── report-upstream-drift.ts
│   └── copy-method-into-persona.ts
│
├── docs/
│   ├── architecture.md
│   ├── authoring-personas.md
│   ├── provider-integration.md
│   ├── testing/
│   │   ├── CONFIRMED_SEAMS.md
│   │   └── TDD_LOG.md
│   └── decisions/
│       └── 0001-independent-persona-files.md
│
└── test/
    ├── fixtures/
    │   ├── persona-files/
    │   ├── projects/
    │   └── attestations/
    ├── contract/
    ├── integration/
    └── e2e/
```

## 3. What must not exist

The package should fail `verify:no-shared-corpus` if it finds runtime structures such as:

```text
roles/
methods/
corpus/
generated/agents/
shared-skills/
```

A `test/fixtures` directory may contain isolated fixtures. Documentation may quote source material. There must be no runtime method directory used by multiple personas.

## 4. Package manifest

Conceptual shape:

```json
{
  "name": "pi-persona-teams",
  "type": "module",
  "pi": {
    "extensions": [
      "./extensions/persona-parent.ts"
    ],
    "skills": [
      "./skills/persona-team"
    ],
    "subagents": {
      "agents": [
        "./agents"
      ]
    }
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "pi-subagents": "*"
  }
}
```

Confirm the exact `pi-subagents` package-agent manifest key against the installed version before implementation. Pin a tested version in the lockfile and compatibility matrix rather than assuming all future versions.

## 5. Parent-visible content

The parent should see:

- One compact `persona-team` orchestration skill.
- The `persona_team` tool.
- Persona names and descriptions through normal discovery.

The parent should not receive:

- All copied method bodies.
- All complete persona prompts.
- Child-only enforcement instructions.
- Another agent’s methods.

## 6. Child-visible content

A selected child sees:

- Its one complete persona file.
- Its own copied method bodies.
- Project context when configured.
- Generic `persona_contract`.
- Normal installed tools and providers.
- No other persona file in the system prompt.

The file may physically coexist with others in the package. Independence refers to semantic and runtime dependency, not filesystem secrecy.

## 7. One-time copying and ongoing maintenance

A helper may reduce manual errors when initially copying a method:

```bash
bun run copy-method-into-persona \
  --persona engineering-manager \
  --source ../prime-persona-teams/library/generated/methods/persona-team-system-design/SKILL.md
```

The helper should:

- Insert the full body.
- Convert nested frontmatter into embedded metadata.
- Compute the body hash.
- Refuse duplicate IDs.
- Produce a diff.
- Modify only the selected persona file.

After copying, the persona file is canonical. There is no build-time reconstruction.

## 8. Upstream drift report

`report-upstream-drift` may compare embedded provenance against an upstream checkout and report:

- unchanged
- upstream changed
- upstream removed
- local copy diverged intentionally

It must never silently rewrite all copies. The operator chooses each update per persona.

## 9. Installation

Target user flow:

```bash
pi install npm:pi-subagents
pi install git:github.com/tayiorbeii/pi-persona-teams
```

Or an npm package after publication.

No context-mode or jCodeMunch install is required for baseline operation. Existing user installations are discovered automatically.

## 10. Doctor output

`/persona-doctor` or `persona_team({ action: "doctor" })` should report:

- Pi compatibility.
- `pi-subagents` API availability.
- Ten persona discovery status.
- Shadowing/collision status.
- Independent-file validation.
- Child extension resolution.
- Attestation storage.
- context-mode availability.
- jCodeMunch availability.
- Baseline readiness.
- Degraded but usable conditions.
- Blocking conditions with exact fixes.

## 11. Rollback

Rollback should be ordinary package removal:

```bash
pi remove pi-persona-teams
```

or the installed package’s supported remove command.

Removing this package must not:

- Remove `pi-subagents`.
- Remove context-mode.
- Remove jCodeMunch.
- Delete user project artifacts.
- Delete ordinary Pi sessions.
- Modify unrelated agent files.

## 12. Versioning

Version changes should distinguish:

- Persona content changes.
- Embedded method updates.
- Enforcement behavior changes.
- Attestation schema changes.
- Pi/`pi-subagents` compatibility changes.

A method copied into two personas may update in one without requiring the other to update. Record that divergence in the changelog.
