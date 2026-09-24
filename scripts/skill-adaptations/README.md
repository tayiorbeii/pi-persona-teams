# gstack -> Pi skill adaptations

Recorded compatibility transforms applied by `../import-vendored-skills.ts`
when vendoring gstack-derived skills from the pinned aggregate checkout
(`tayiorbeii/paperclip-factory-kit@86038facb8be556bf66fd945271eff2c51308fd1`).

- `pi-gstack-v1.ts` — adaptation v1 (current). Deterministic transform:
  1. Requires the kit's `gstack-preamble-patched` tag (context check; a
     mismatched aggregate aborts the import instead of producing unreviewed
     output).
  2. Removes the Claude-only `allowed-tools` frontmatter block.
  3. Inserts the recorded `Pi adaptation (vendored)` notice (capability
     mapping for AskUserQuestion/plan-mode APIs, gstack helpers and state,
     cross-skill invocations) above the preserved methodology body.

Everything else in each skill body is preserved verbatim so methodology
preservation stays reviewable as a small diff.

## Review status

`adaptation.reviewed: false` is recorded per entry in
`skills/vendor-manifest.json`: the systematic transform is reviewed here, but
the plan's per-skill independent content review (methodology preservation and
residual gstack dependencies) remains an outstanding release gate.
