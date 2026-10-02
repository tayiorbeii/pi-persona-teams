# Upstream proposal: keep MCP metadata per config hash

Status: local draft. Nothing here has been published, pushed, or opened as a PR. `scripts/pin-pi-mcp.ts` is the local workaround until a fix like this ships upstream.

## Problem

pi-mcp-adapter writes one global metadata cache (`~/.pi/agent/mcp-cache.json`) with one entry per server name. Each entry carries the `configHash` of the definition that produced it. pi-subagents (and the adapter itself) accept an entry only when that hash matches the definition they resolve for their cwd.

MCP config is per project: a project's `.mcp.json` or `.pi/mcp.json` overrides the global definition. When two projects define the same server name differently (for example, one launches `jcodemunch-mcp` and another launches a wrapper script), every connect in one project overwrites the other project's entry. The last session to connect wins. In every other project, direct-tool selectors stop resolving:

```
Unresolved MCP direct-tool selectors: jcodemunch/search_text, ...
Direct MCP tools require a matching configured server and fresh metadata cache
```

Observed with ~30 checkouts and many concurrent pi sessions: subagent preflight flipped between ready and failed within an hour, and only one project's definitions could be valid at a time. A `/mcp reconnect` fixed the current project and broke the others. pi-mcp-adapter 5.0.0 still keys by name, and its startup now rediscovers any entry from a different config, so the overwrites become more frequent.

## Change

Backward compatible. No cache version bump.

- **pi-mcp-adapter** (`pi-mcp-adapter-2.31.0.patch`): `saveMetadataCache` keeps `servers[name]` exactly as before, last writer wins. It also records every entry under a new top-level `variants[name][configHash]`, merged from disk the same way `servers` already is and capped at 8 configs per server (least recently cached dropped first). It also exports `selectServerCacheEntry(cache, name, definition)`, which returns the top-level entry when its hash matches, else the variant for that definition's hash.
- **pi-subagents** (`pi-subagents-0.60.0.patch`): the cache loader parses `variants`, keeping only entries whose `configHash` equals their key. Direct-tool resolution uses the matching variant when the top-level entry belongs to another config. Validation (`isServerCacheValid`: hash match plus max age) is unchanged.

Readers that don't know about `variants` see the same `servers` map as today.

## Follow-ups for the adapter PR

- Use `selectServerCacheEntry` at the adapter's own lookups (`direct-tools.ts` direct-tool registration, `mcp-references.ts`, the startup rediscovery check in 5.x) so a session doesn't rediscover a server that another project's session just overwrote.
- Rebase onto the current releases: the patches were written against the installed pi-mcp-adapter 2.31.0 and pi-subagents 0.60.0; latest are 5.0.0 and 0.74.0.

## Verification

`variants.test.ts` uses two projects that define `srv` differently and share one agent dir:

1. The unpatched pi-subagents reproduces the bug: after the other project writes last, the global project's `srv/lookup` is unresolved.
2. With both patches, both projects resolve, whichever order they write in.
3. `servers` stays last-writer-wins, and `variants` holds both hashes.
4. Variants are capped per server.

```sh
ADAPTER_DIR=<patched pi-mcp-adapter> SUBAGENTS_DIR=<patched pi-subagents> \
  ORIGINAL_SUBAGENTS_DIR=<unpatched pi-subagents> bun test ./variants.test.ts
```

Result against the patched 2.31.0 / 0.60.0 copies: 4 pass, 0 fail.
