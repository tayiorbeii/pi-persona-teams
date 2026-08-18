# Upstream fix guide: pi-subagents relative child-extension paths

This document captures everything needed to fork the official `nicobailon/pi-subagents`
repository, apply the fix, and open a pull request describing the issue and the fix.

The same fix is already recorded as a machine-applicable patch in
[`docs/pi-subagents-relative-extension-paths.patch`](./pi-subagents-relative-extension-paths.patch).

---

## 1. Issue summary

**Title suggestion**

> Relative `subagentOnlyExtensions` / `extensions` paths resolve against the launch cwd instead of the agent file's directory

**Problem**

When an agent file declares a relative child-extension path in its frontmatter:

```yaml
subagentOnlyExtensions: ../extensions/persona-child.ts
```

`pi-subagents` stores that string verbatim and later forwards it to the child Pi process
as a `--extension` argument. The child Pi resolves the path against its launch cwd
(usually the parent's project directory), **not** against the directory containing the
agent file that declared it.

Concrete failure from `pi-persona-teams`:

```text
/Users/taylor/Documents/Projects/03-tools/extensions/persona-child.ts
Extension path does not exist
```

The agent file actually lives at:

```text
~/.pi/agent/git/github.com/tayiorbeii/pi-persona-teams/agents/<name>.md
```

so `../extensions/persona-child.ts` should resolve to:

```text
~/.pi/agent/git/github.com/tayiorbeii/pi-persona-teams/extensions/persona-child.ts
```

but it was instead resolved against the parent project cwd.

## 2. Root cause

Agent discovery parses frontmatter in `src/agents/agents.ts`, in `loadAgentsFromDir()`.
The parsed list values are stored without resolving relative filesystem paths:

```ts
const extensions = parseFrontmatterList(frontmatter.extensions);
const subagentOnlyExtensions = parseFrontmatterList(frontmatter.subagentOnlyExtensions);
```

These values later flow into `src/runs/shared/pi-args.ts`, where they are combined into
`extensionArgs` and emitted as `--extension <value>`. At no point is the defining agent
file's directory used to resolve `./`- or `../`-prefixed paths.

The fix must happen at discovery time because that is the only place the defining agent
file's path (`filePath`) is known.

## 3. The fix

### 3.1 Source change — `src/agents/agents.ts`

Add one helper immediately before `loadAgentsFromDir()`:

```ts
function resolveAgentRelativeExtensionPaths(paths: string[] | undefined, agentFilePath: string): string[] | undefined {
	if (paths === undefined) return undefined;
	const baseDir = path.dirname(agentFilePath);
	return paths.map((entry) => {
		const trimmed = entry.trim();
		if (trimmed === "." || trimmed === ".." || trimmed.startsWith("./") || trimmed.startsWith("../")) {
			return path.resolve(baseDir, trimmed);
		}
		return entry;
	});
}
```

Then replace the two parse lines inside `loadAgentsFromDir()`:

```ts
const extensions = resolveAgentRelativeExtensionPaths(parseFrontmatterList(frontmatter.extensions), filePath);
const subagentOnlyExtensions = resolveAgentRelativeExtensionPaths(parseFrontmatterList(frontmatter.subagentOnlyExtensions), filePath);
```

Semantics:

- `./` and `../` paths are resolved against `dirname(filePath)` of the defining agent file.
- Absolute paths, `~/...` paths, and bare package/module specifiers are left unchanged,
  so downstream resolution behavior for those is preserved.

### 3.2 Test updates

Three existing unit tests asserted the old (raw relative) behavior and must be updated to
expect the resolved absolute paths:

- `test/unit/agent-frontmatter.test.ts`
  - `"discovers newline block lists for all list fields and routes MCP tools"`
  - `"preserves comma-separated syntax across all list fields"`
  - `"parses subagentOnlyExtensions from discovered agent frontmatter"`
- `test/unit/agent-management.test.ts`
  - `"creates agents with subagent-only extensions"`
- `test/unit/default-extensions.test.ts`
  - `"applies the allowlist only when an agent has no extensions field"`
  - `"supports per-agent extensions through agentOverrides"`

The exact replacements are contained in
[`docs/pi-subagents-relative-extension-paths.patch`](./pi-subagents-relative-extension-paths.patch).

Note: settings-derived extensions (`defaultExtensions`, `agentOverrides`) are intentionally
**not** rewritten — they are not agent-file-relative. Only frontmatter values are resolved.

## 4. How to verify locally

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run typecheck
node --experimental-strip-types --import ./test/support/isolated-temp-root.mjs --test test/unit/agent-frontmatter.test.ts test/unit/agent-management.test.ts test/unit/default-extensions.test.ts test/unit/agent-overrides.test.ts test/unit/pi-args.test.ts
```

Expected: the extension-related tests pass. The full unit suite also contains a few
pre-existing failures unrelated to this change (e.g. `"loads packaged worker and oracle
with fork defaultContext"`, the two Windows `APPDATA` npm-root tests, and a couple of
agent-management detail tests) that fail on an unmodified checkout as well.

## 5. Fork + PR workflow

### Step 1 — Fork

1. Open https://github.com/nicobailon/pi-subagents
2. Click **Fork** → create the fork under your GitHub account.

### Step 2 — Clone your fork

```bash
git clone https://github.com/<you>/pi-subagents.git
cd pi-subagents
git remote add upstream https://github.com/nicobailon/pi-subagents.git
git fetch upstream
git checkout -b fix/agent-relative-extension-paths upstream/main
```

### Step 3 — Apply the fix

Either apply the recorded patch:

```bash
# from the pi-persona-teams repo
git -C /path/to/pi-subagents apply /path/to/pi-persona-teams/docs/pi-subagents-relative-extension-paths.patch
```

or make the two edits from section 3.1 by hand.

### Step 4 — Run the verification

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run typecheck
node --experimental-strip-types --import ./test/support/isolated-temp-root.mjs --test \
  test/unit/agent-frontmatter.test.ts \
  test/unit/agent-management.test.ts \
  test/unit/default-extensions.test.ts \
  test/unit/agent-overrides.test.ts \
  test/unit/pi-args.test.ts
```

### Step 5 — Commit

```bash
git add src/agents/agents.ts test/unit/agent-frontmatter.test.ts \
  test/unit/agent-management.test.ts test/unit/default-extensions.test.ts
git commit -m "fix(agents): resolve relative extension paths against the defining agent file"
```

### Step 6 — Push

```bash
git push -u origin fix/agent-relative-extension-paths
```

### Step 7 — Open the PR

Open https://github.com/nicobailon/pi-subagents and click **Compare & pull request**
for your new branch. Use the title and body below.

---

## 6. PR title

```
fix(agents): resolve relative extension paths against the defining agent file
```

## 7. PR body (copy-paste)

```markdown
## Problem

When an agent file declares a relative child-extension path:

```yaml
subagentOnlyExtensions: ../extensions/persona-child.ts
```

`pi-subagents` forwards the value unchanged to the child Pi process as `--extension`.
Pi resolves the relative path against the child's launch cwd (the parent project
directory), not against the directory containing the agent file that declared it.

This produces errors like:

```text
/Users/taylor/Documents/Projects/03-tools/extensions/persona-child.ts
Extension path does not exist
```

even though the agent file and its extension are co-located inside an installed
package (`~/.pi/agent/git/<host>/<repo>/agents/…` + `…/extensions/…`).

## Root cause

`loadAgentsFromDir()` in `src/agents/agents.ts` stores `extensions` and
`subagentOnlyExtensions` without resolving relative filesystem paths. The defining
agent file's directory (`filePath`) is known at discovery time but is not used.

## Fix

Add `resolveAgentRelativeExtensionPaths()` and apply it to both fields at discovery
time. Explicit `./` and `../` paths are resolved against `dirname(filePath)`;
absolute paths, `~/...` paths, and bare package/module specifiers are left untouched.

Settings-derived extensions (`defaultExtensions`, `agentOverrides`) are intentionally
not rewritten — only agent-frontmatter values are agent-file-relative.

## Tests

Updated the affected unit tests to assert the resolved absolute paths and verified:

- `npm run typecheck`
- the agent-frontmatter, agent-management, default-extensions, agent-overrides, and
  pi-args unit test files pass
```

---

## 8. Notes

- The patch targets `nicobailon/pi-subagents` at `main` (version `0.51.0` at the time of
  capture). If the file has drifted, apply the equivalent two-line change plus helper
  described in section 3.1 and re-check the surrounding test assertions.
- The installed `node_modules` copy was patched manually for local verification; that
  patch is **not durable** across reinstall. The PR (this document) is the durable fix.
