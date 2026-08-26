# Provider integration

Canonical agents omit both `tools:` and `extensions:` frontmatter. Official `pi-subagents` therefore launches them with Pi's normal builtin tools and discovered extensions rather than a package-maintained allowlist. This keeps default tools such as `fffind`, `ffgrep`, and the generic `mcp` gateway available as the user's Pi setup evolves. The package-only `persona_contract` tool is added through `subagentOnlyExtensions` without suppressing ambient extensions.

The first `persona_contract.status` call returns the actual bound tool names. The child must report that list before activating methods or doing substantive work. Provider detection accepts native direct names plus the namespaced forms produced by Pi and `pi-mcp-adapter`, but descriptor-based availability still requires trusted provider provenance. Direct MCP tools are preferred when the ambient child registry contains them; otherwise the child may use the generic MCP gateway or bounded native fallback and must report degraded evidence.

- context-mode is used for bounded indexed search, indexing, large-output reduction, and external document retrieval when its direct tools or generic MCP route are available. Role policy—not a frontmatter tool allowlist—governs executable operations.
- jCodeMunch is used for repository resolution, text/symbol search, outlines, exact source, ranked context, bundles, and index refresh.
- Octocode is not a provider. Read-only external GitHub research runs through the `octocode-research` skill and the version-pinned `npx -y octocode@18.3.0` command allowlist; inherited skill guidance cannot override this exact-version policy. Mutable `@latest`, cloning, local-file operations, and unrelated `npx` execution remain blocked.
- Normal Pi tools remain available throughout the run. Provider failure grants one bounded native fallback; it does not require editing persona frontmatter.

A logical routing fingerprint can be redirected to a preferred provider once. After a provider failure, fallback is granted once and is never redirected back into the failed provider. Provider status is carried into the ledger and attestation.
