# Context Provider Integration

## 1. Baseline rule

The persona package must run with ordinary Pi and `pi-subagents` only.

context-mode and jCodeMunch are optional providers. Their absence is supported and tested.

## 2. Do not disable ambient providers

Persona frontmatter should initially omit:

- A strict `extensions` allowlist.
- A strict `tools` allowlist.

This lets the child receive the user’s ordinary Pi extension and MCP configuration. Role authority is enforced dynamically by the child extension.

## 3. Generic provider interface

Treat providers as external boundaries with specific operations, not a generic conditional fetcher.

Suggested interfaces:

```typescript
interface ContextModeProvider {
  detect(): Promise<ProviderAvailability>;
  searchContent(input: ContentSearchInput): Promise<ProviderResult>;
  processLargeOutput(input: LargeOutputInput): Promise<ProviderResult>;
}

interface JCodeMunchProvider {
  detect(): Promise<ProviderAvailability>;
  resolveRepository(input: ResolveRepoInput): Promise<ProviderResult>;
  getStructure(input: StructureInput): Promise<ProviderResult>;
  searchCode(input: CodeSearchInput): Promise<ProviderResult>;
  getImpact(input: ImpactInput): Promise<ProviderResult>;
  registerEdit(input: RegisterEditInput): Promise<ProviderResult>;
}
```

The adapters may call direct tools, an MCP proxy, or inspect the runtime registry. The rest of the package should not care which transport is present.

## 4. Runtime discovery

Use Pi’s runtime tool registry and provenance where available.

Detection should consider:

- Exact known tool names.
- Namespaced direct MCP tools.
- Tool descriptions.
- Source/provenance metadata.
- A generic MCP proxy when direct tools are not exposed.

Do not hard-code one user’s naming convention as the only supported configuration.

Re-probe after startup if context-mode registers tools lazily before the first model call.

## 5. context-mode policy

Prefer context-mode for:

- Large files and large command output.
- Content/document search.
- Bounded indexing and retrieval.
- Web or downloaded content where context-mode owns routing.
- Session/context recovery where supported.
- Summarizing large external evidence without flooding the child context.

Do not duplicate:

- context-mode HTTP restrictions.
- Its compaction lifecycle.
- Its session database.
- Its large-output offloading.
- Its provider bridge.

Persona enforcement records whether it was used and prevents role-policy bypass; it does not become a second context-mode implementation.

## 6. jCodeMunch policy

Prefer jCodeMunch for:

- Repository resolution and indexing status.
- Repository outlines.
- File trees and file outlines.
- Symbol search.
- Exact symbol source.
- Bounded context bundles.
- References and importers.
- Dependency and call relationships.
- Blast-radius analysis.
- Changed symbols.
- Post-edit index refresh when supported.

Do not force jCodeMunch for:

- Non-code strategy tasks.
- Files or languages it cannot parse.
- A task where the provider is absent or unhealthy.
- A whole-file operation that genuinely requires full context and is documented as such.

## 7. Per-role relevance

| Role | context-mode | jCodeMunch |
|---|---|---|
| Founder & CEO | Use for external/product evidence when available | Usually optional; required only when strategy depends on current code |
| Product Designer | Use for research and large product docs | Use when mapping experience to current implementation |
| DevEx Lead | Use for docs and command output | Strongly preferred for SDK/API/CLI code structure |
| Engineering Manager | Use for plans, docs, logs, and large evidence | Strongly preferred for repository structure and impact |
| Implementation Engineer | Use for large outputs and docs | Strongly preferred before edits and after edits |
| Staff Reviewer | Use for large diffs/logs | Strongly preferred for changed symbols, references, and impact |
| Security Officer | Use for configs/logs/docs | Preferred for trust-boundary source inspection and blast radius |
| QA Lead | Use for test output and evidence packs | Preferred for changed code and relevant call paths |
| Release Engineer | Use for build/deploy output and release evidence | Use for changed-symbol/release-scope inspection |
| Retro / Ops Manager | Use for incident/release evidence | Use when learning depends on code change structure |

## 8. Required-if-available-and-relevant

This policy means:

1. The child checks availability.
2. The child determines task relevance using its role contract.
3. If available and relevant, it uses the provider before broad native exploration.
4. If it does not use the provider, it records a concrete non-use reason.
5. If the provider fails, it records failure and may use bounded native fallback.
6. The attestation reports `used`, `not_applicable`, `degraded`, or `unavailable`.

It does not mean that absence fails the persona.

## 9. Native fallback

Native fallback is allowed after:

- Provider absence.
- Provider startup failure.
- Provider call failure.
- Unsupported file/language.
- A documented operation the provider cannot represent.

Fallback requirements:

- Keep reads bounded.
- Prefer targeted ranges and files.
- Avoid dumping large outputs into context.
- Record the provider failure and fallback operation.
- Do not silently convert a healthy provider preference into native-first behavior.

## 10. Loop prevention

The extension should maintain a routing state per logical operation.

Example:

```typescript
type RoutingAttempt = {
  fingerprint: string;
  preferredProvider: "context-mode" | "jcodemunch";
  redirected: boolean;
  providerFailed: boolean;
  fallbackGranted: boolean;
};
```

Rules:

- Redirect a matching native bypass at most once.
- If the provider fails, permit fallback for that fingerprint.
- Do not redirect the fallback back to the failed provider.
- Expire state at task completion or a bounded time.
- Surface repeated failures in the attestation.

## 11. TDD boundary policy

context-mode and jCodeMunch are external systems, so their adapters may be faked in tests.

Use specific fakes:

```typescript
const fakeJCodeMunch = {
  resolveRepository: async () => ({ status: "available", repoId: "fixture" }),
  getStructure: async () => ({ files: ["src/index.ts"] })
};
```

Avoid a generic fake whose behavior branches on arbitrary endpoint strings.

The package’s own provider resolver must be exercised through the public provider/doctor or persona-run seam rather than mocked away.
