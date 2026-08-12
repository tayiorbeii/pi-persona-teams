# Independent Persona Agent File Specification

## 1. Invariant

Each file under `agents/` is a complete, canonical persona.

A reader must be able to understand the role, its methods, its authority, and its completion rules by opening only that agent file. The generic enforcement extension is shared, but no persona semantics are sourced from that extension.

## 2. File names

```text
agents/
├── founder-ceo.md
├── product-designer.md
├── devex-lead.md
├── engineering-manager.md
├── implementation-engineer.md
├── staff-reviewer.md
├── security-officer.md
├── qa-lead.md
├── release-engineer.md
└── retro-ops-manager.md
```

The runtime package-qualified name is:

```text
persona-team.<file-stem>
```

## 3. Required frontmatter

Use only `pi-subagents` fields needed to launch the child. Do not use frontmatter to refer to shared method files.

Example:

```yaml
---
name: engineering-manager
package: persona-team
description: Convert approved intent into a bounded, dependency-aware technical plan and build queue.
systemPromptMode: replace
inheritProjectContext: true
inheritSkills: false
defaultContext: fresh
subagentOnlyExtensions:
  - ../extensions/persona-child.ts
thinking: high
acceptanceRole: read-only
completionGuard: false
maxSubagentDepth: 1
---
```

### Rules

- `inheritSkills: false` prevents the child from receiving unrelated global skills.
- Do not declare `skillPath`.
- Do not list methodology skills in `skills`.
- Do not declare an `extensions` allowlist in the initial version; ambient context providers must remain discoverable.
- Omit a strict `tools` allowlist initially. The child extension performs policy checks after the complete runtime tool registry is available.
- Role-specific model overrides belong in user/project settings, not in canonical persona semantics, unless a role genuinely requires a model capability.

## 4. Required body sections

Every file must contain these sections in this order:

1. `# <Role Name>`
2. `## Identity`
3. `## Mission`
4. `## Operating Posture`
5. `## Responsibilities`
6. `## Non-Responsibilities`
7. `## Required Inputs`
8. `## Required Outputs`
9. `## Decision Rules`
10. `## Escalation Rules`
11. `## Workspace and Authority Policy`
12. `## Context Access Policy`
13. `## Mandatory Method Protocol`
14. `## Machine-Readable Persona Contract`
15. `## Embedded Methods`
16. One complete embedded method section per mandatory method
17. `## Completion Checklist`
18. `## Completion Standard`

Role content should be copied and adapted from the existing Prime persona role. Host-specific Prime/Python API references should be rewritten for ordinary Pi while preserving the role’s meaning and authority boundaries.

## 5. Machine-readable contract block

The generic child extension needs a deterministic block it can parse. Put JSON in an HTML comment so it is visible in the system prompt but does not interfere with Markdown rendering.

Example:

```markdown
<!-- pi-persona-contract:v1
{
  "schema": "pi.persona-contract/v1",
  "role": "engineering-manager",
  "runtimeName": "persona-team.engineering-manager",
  "authority": "read-only",
  "requiredMethods": [
    "persona-team-domain-driven-design",
    "persona-team-system-design",
    "persona-team-ddia-systems",
    "persona-team-clean-architecture"
  ],
  "activation": {
    "requiredBeforeSubstantiveTools": true,
    "requirePlannedApplication": true
  },
  "completion": {
    "requireDisposition": true,
    "allowedDispositions": ["applied", "not_applicable"],
    "maxRepairTurns": 2
  },
  "providers": {
    "contextMode": "required_if_available_and_relevant",
    "jcodemunch": "required_if_available_and_relevant",
    "nativeFallback": "allowed_with_degraded_evidence"
  }
}
-->
```

The contract block is part of the agent file’s semantic source. There is no separate role contract JSON file.

## 6. Embedded method format

Every assigned method must be copied in full into the agent file.

Use a metadata marker followed by the full method text:

```markdown
### Embedded Method: System Design

<!-- pi-persona-method:v1
{
  "id": "persona-team-system-design",
  "license": "MIT",
  "sourceRepository": "tayiorbeii/prime-persona-teams",
  "sourceCommit": "<pinned-commit>",
  "sourcePath": "library/generated/methods/persona-team-system-design/SKILL.md",
  "bodySha256": "<sha256-of-the-copied-method-body>"
}
-->

<pi-persona-method-body id="persona-team-system-design">

# System Design Framework

[Complete copied method body. No summary and no link-only replacement.]

</pi-persona-method-body>
```

### Copy rules

- Copy the full method body, not merely its description or checklist.
- Preserve license and provenance metadata.
- Convert the nested method’s YAML frontmatter into the metadata marker rather than placing a second YAML frontmatter block in the agent file.
- Inline any method reference content that is required to apply the method.
- Do not leave dangling relative references.
- Do not replace content with “see shared skill.”
- Do not import content at runtime.
- Do not deduplicate identical methods between persona files.
- Compute `bodySha256` from the exact copied body between the method-body tags.
- The child extension verifies the internal hash at startup.

## 7. Mandatory method protocol in prose

Every file must tell the child:

1. All mandatory methods are already present below.
2. Before substantive repository, research, edit, or shell tools, call `persona_contract.activate` once for every required method.
3. Each activation includes a task-specific planned application.
4. A method may later be marked:
   - `applied`, with concrete evidence; or
   - `not_applicable`, with a specific justification.
5. A method cannot be omitted.
6. Completion is invalid until `persona_contract.complete` passes.
7. The host’s attestation, not the child’s prose, controls persona compliance.

## 8. Context policy in every file

Each persona file includes its own complete context-provider instructions.

Common policy:

```text
Use context-mode for bounded content search, indexing, large documents,
command output, and web/document context when it is installed and relevant.

Use jCodeMunch for repository orientation, symbol lookup, file outlines,
references, importers, call relationships, changed-symbol analysis, and
blast-radius analysis when it is installed and relevant.

Check provider availability before relying on either provider. When a provider
is absent or fails, use bounded native Pi tools and record degraded evidence.
Do not repeat a failed redirect indefinitely.
```

Each role may add narrower rules. For example:

- Engineering Manager must use jCodeMunch for codebase structure when available.
- Product Designer may use it only when the product task depends on current implementation.
- Founder & CEO may mark it not applicable for non-code strategic tasks.
- Implementation Engineer must refresh or register edited files when the installed jCodeMunch interface supports it.

## 9. Authority policy in every file

The contract and prose must agree.

Suggested authority categories:

- `strategy-read-only`
- `planning-read-only`
- `implementation-writer`
- `independent-review-read-only`
- `release-prepare`
- `retrospective-read-only`

The generic child extension maps these categories to generic behavior, but the exact category is declared in the persona file.

## 10. Independence tests

Each persona file must pass public package validation proving:

- It can be discovered without any method directory.
- It contains exactly one persona contract.
- Its runtime name matches the file name.
- Every required method has exactly one embedded body.
- No unlisted embedded method appears.
- Every embedded hash matches its body.
- No method body points to a required local reference outside the file.
- No text says “load this method from” another package path.
- Deleting another persona file does not prevent this persona file from validating.
- Copying this agent file plus the generic extension into a fixture package is sufficient to parse and enforce its contract.

## 11. Maintenance policy

The committed persona files are authoritative. A maintenance script may:

- Detect upstream changes.
- Produce a report.
- Copy a selected upstream method into a selected persona file.
- Recompute that embedded body’s hash.
- Show a diff.

It must not silently regenerate all persona files from a central corpus. Updates are reviewed and committed per persona file.

This deliberately accepts duplication and update effort in exchange for independence, inspectability, and role-specific evolution.
