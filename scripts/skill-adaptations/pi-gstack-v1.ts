// Vendored-skill adaptation for gstack-derived skills (recorded, deterministic).
//
// The plan (plans/16-BUNDLED-SKILLS-PLAN.md) requires gstack content to be
// adapted to Pi before registration: no gstack binaries, state, host paths,
// or Claude-only APIs may be required by active instructions. This module is
// the recorded compatibility transform; the importer fails if a source file
// does not match its expected context (kit preamble-patch tag present).
//
// Methodology bodies are preserved verbatim; only frontmatter's Claude-only
// `allowed-tools` block is removed and a recorded Pi adaptation notice is
// inserted. Per-skill human content review is tracked in the manifest
// (adaptation.reviewed) and remains a release gate.

export const ADAPTATION_VERSION = 1;

export const ADAPTATION_NOTICE = `## Pi adaptation (vendored)

> Adapted for Pi from \`garrytan/gstack@25cf5edf210fee2cd296ffb2dfb2eff370ebcf35\`
> by \`scripts/import-vendored-skills.ts\` (adaptation v${ADAPTATION_VERSION}). The methodology
> below is preserved; tool-specific mechanics are remapped as follows:
>
> - \`AskUserQuestion\`, \`ExitPlanMode\`, and other Claude-only APIs: ask the user
>   directly in the conversation with the same options, and follow Pi's own
>   plan-mode norms instead of Claude plan-mode machinery.
> - gstack helpers, \`~/.gstack/\` state, \`~/.claude/skills/gstack/...\` paths, and
>   upgrade or telemetry flows: unavailable by design. Do not install, create,
>   or require them. When a step depends on one, say so once, keep the portable
>   methodology, and route any necessary environment work to the parent session
>   with explicit evidence requirements.
> - \`/gstack-*\` cross-skill invocations: these skills are vendored side-by-side
>   in this package; reference them by skill name. A missing one is an
>   unavailable capability to report, never something to install.
> - The Claude \`allowed-tools\` frontmatter block was intentionally omitted here.
>
> Original gstack content follows unchanged below this notice.

---

`;

/** The kit's gstack importer tag every source must carry before adaptation. */
export const EXPECTED_KIT_TAG = "gstack-preamble-patched";

export interface AdaptationResult {
  content: string;
  removedAllowedTools: boolean;
}

/**
 * Deterministic gstack -> Pi adaptation. Fails (returns no content) when the
 * source does not carry the kit's recorded preamble-patch tag, so context
 * drift between the aggregate checkout and this transform is caught instead
 * of silently producing unreviewed output.
 */
export function adaptGstackSkill(kitContent: string): AdaptationResult | undefined {
  if (!kitContent.includes(EXPECTED_KIT_TAG)) return undefined;
  let content = kitContent;
  let removedAllowedTools = false;
  const allowedToolsBlock = /\nallowed-tools:\n(  - .*\n)+/;
  if (allowedToolsBlock.test(content)) {
    content = content.replace(allowedToolsBlock, "\n");
    removedAllowedTools = true;
  }
  const split = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!split) return undefined;
  const [full, frontmatter] = split;
  const rest = content.slice(full.length);
  content = `${full}${ADAPTATION_NOTICE}${rest}`;
  return { content, removedAllowedTools };
}
