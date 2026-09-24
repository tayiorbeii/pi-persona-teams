---
name: gstack-unfreeze
version: 0.1.0
description: |
  Clear the freeze boundary set by /freeze, allowing edits to all directories
  again. Use when you want to widen edit scope without ending the session.
  Use when asked to "unfreeze", "unlock edits", "remove freeze", or
  "allow all edits". (gstack)
triggers:
  - unfreeze edits
  - unlock all directories
  - remove edit restrictions
license: MIT
metadata:
  sources:
    - kind: github-file
      repo: garrytan/gstack
      path: unfreeze/SKILL.md
      commit: 25cf5edf210fee2cd296ffb2dfb2eff370ebcf35
      sha256: c0738722f0f60e7653341ae0c061dba6a63bc32f5781d52a1f0b062f8fa5707a
      attribution: gstack / Garry Tan
      license: MIT
      usage: transformed
  paperclip:
    imported_at: 2026-05-15T05:31:10.273Z
    importer_version: 0.1.0
    transformation: gstack-preamble-patched
    source_command: /unfreeze
    original_name: unfreeze
---
## Pi adaptation (vendored)

> Adapted for Pi from `garrytan/gstack@25cf5edf210fee2cd296ffb2dfb2eff370ebcf35`
> by `scripts/import-vendored-skills.ts` (adaptation v1). The methodology
> below is preserved; tool-specific mechanics are remapped as follows:
>
> - `AskUserQuestion`, `ExitPlanMode`, and other Claude-only APIs: ask the user
>   directly in the conversation with the same options, and follow Pi's own
>   plan-mode norms instead of Claude plan-mode machinery.
> - gstack helpers, `~/.gstack/` state, `~/.claude/skills/gstack/...` paths, and
>   upgrade or telemetry flows: unavailable by design. Do not install, create,
>   or require them. When a step depends on one, say so once, keep the portable
>   methodology, and route any necessary environment work to the parent session
>   with explicit evidence requirements.
> - `/gstack-*` cross-skill invocations: these skills are vendored side-by-side
>   in this package; reference them by skill name. A missing one is an
>   unavailable capability to report, never something to install.
> - The Claude `allowed-tools` frontmatter block was intentionally omitted here.
>
> Original gstack content follows unchanged below this notice.

---


<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# /unfreeze — Clear Freeze Boundary

Remove the edit restriction set by `/freeze`, allowing edits to all directories.

```bash
mkdir -p ~/.gstack/analytics
echo '{"skill":"unfreeze","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> ~/.gstack/analytics/skill-usage.jsonl 2>/dev/null || true
```

## Clear the boundary

```bash
eval "$(~/.claude/skills/gstack/bin/gstack-paths)"
STATE_DIR="$GSTACK_STATE_ROOT"
if [ -f "$STATE_DIR/freeze-dir.txt" ]; then
  PREV=$(cat "$STATE_DIR/freeze-dir.txt")
  rm -f "$STATE_DIR/freeze-dir.txt"
  echo "Freeze boundary cleared (was: $PREV). Edits are now allowed everywhere."
else
  echo "No freeze boundary was set."
fi
```

Tell the user the result. Note that `/freeze` hooks are still registered for the
session — they will just allow everything since no state file exists. To re-freeze,
run `/freeze` again.
