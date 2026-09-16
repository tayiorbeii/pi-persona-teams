# Execution graph: package all upstream skills

Companion to `16-BUNDLED-SKILLS-PLAN.md`; corrected after independent native review of the pi-plan artifacts. Planning only.

Run these as ordered gates; a failed blocking gate stops the rollout rather than permitting a partial or misleading package.

```text
G0 Baseline + authority audit
  -> G1 Pi discovery contract + package schema
  -> G2 License/provenance and both families' support recovery
  -> G3 Manifest schema + deterministic resolver fixtures
  -> G4 Vendor byte-preserving content and closure files
  -> G5 Manifest generation and integrity verifier
  -> G6 Manifest/package declarations and package gates
  -> G7 Installed closure + Pi discovery integration tests
  -> G8 Persona boundary/policy regression tests
  -> G9 Drift/update tooling tests and docs/changelog
  -> G10 Full verification and release-readiness gate
```

## G0 — Establish immutable inputs

- Confirm `/tmp/pi-persona-skills-upstream-20260916` is clean and `HEAD` equals `86038facb8be556bf66fd945271eff2c51308fd1`.
- Enumerate exactly 86 `skills/<slug>/SKILL.md` files: 42 Wondel and 44 gstack; recompute size/SHA-256 and frontmatter values. Treat the prior `gstack-design-html` digest as non-authoritative.
- Verify current `package.json`, ten canonical `agents/*.md`, inline-method hashes/sets, `inheritSkills: true`, child extension binding, and policy/verifier behavior; record immutable persona baseline hashes/invariants.
- Confirm no unrelated work is included in the implementation commit.

## G1 — Prove discovery semantics before changing the manifest

- Inspect the installed Pi package contract and existing package tests/tooling to prove how `pi.skills` directory entries are discovered, including whether entries must point to directories or `SKILL.md` files.
- Design an existing-tool/no-dependency integration test invoking installed Pi's actual discovery API against a packed isolated install and confirming all 87 identities (persona-team + 86). A fixture must invoke that API; parsing package JSON or testing paths alone is insufficient.
- If this cannot be proven with existing tooling, mark the plan blocked; do not downgrade it to a documentation-only gap.

## G2 — Resolve redistribution and local closure prerequisites

- Verify upstream `LICENSE`, README/import scripts, per-file metadata, Wondel MIT notice, and gstack/Garry Tan MIT notice. Check whether the package `LICENSE` is sufficient; otherwise add `NOTICE` and publish it via `package.json#files`.
- Use explicit pinned Wondel and gstack source roots/commits to inventory and recover static supporting documents from both families. Include references in prose/code, not just Markdown links; gstack review checklists, `TODOS-format.md`, and specialist documents are examples. Preserve true relative topology, define logical origin-to-package mappings for authored host paths, deterministic duplicate handling, and hash every physical support file. Executables/state/runtime shims remain excluded; unchanged host-path assumptions remain documented external compatibility requirements.
- Fail this gate if exact support files or required licensing text are unavailable; do not invent content or ship an untestable partial catalog.

## G3 — Define testable on-disk contract

- Add `skills/vendor-manifest.json` schema covering aggregate checkout provenance (`paperclip-factory-kit`, path, `86038...`), origin provenance (Wondel/gstack repo/path/commit), license/attribution, destination, source/package byte counts and hashes, runtime classification, and closure status.
- Define deterministic order (existing `./skills/persona-team`, then the 42 Wondel slugs, then 44 gstack slugs; verify against the final inventory), exact inventory boundaries, and support-file entries.
- Define a Markdown resolver for actual links/images (and only explicitly supported syntax): ignore code blocks/inline code, anchors/fragments/query, and external schemes; recursively resolve local targets; reject traversal, package-root escape, and symlink escape. Add fixtures for fragments, external links, escapes, missing targets, and transitive links. Separately audit static-document references in prose/code and record explicit support mappings and host-runtime exclusions.
- Define deterministic `scripts/import-vendored-skills.ts`: verify explicit aggregate/origin repository identities and pins, generate sorted inventory/support mappings/hashes and registrations, preserve persona-team, and produce zero diff on an identical rerun. Use existing Node/Bun APIs and no changing timestamps or absolute temporary paths in outputs.

## G4 — Vendor content

- Copy each upstream `SKILL.md` byte-for-byte to `skills/<slug>/SKILL.md`.
- Add only exact recovered Wondel and gstack static support files at paths preserving original relative links or documented logical asset mappings. Do not rewrite cross-skill prose, external URLs, `/gstack-*` references, frontmatter, or gstack runtime instructions. Use the deterministic importer from G3.
- Do not add gstack helper binaries, `.gstack` state, Claude runtime shims, or ambient skills `octocode-research`, `ponytail`, `i-have-adhd`.

## G5 — Integrity and provenance implementation

- Add `scripts/verify-vendored-skills.ts` using existing Node/Bun APIs only. Offline checks validate manifest schema, complete 86-slug inventory, declared/actual files, packaged hashes/bytes, frontmatter identity/uniqueness, permitted pins, license fields, runtime classes, and vendor-boundary absence of undeclared content without source checkouts/network. A separate pinned-source comparison verifies explicit roots' repository/commit identities and original bytes; local manifest/hash agreement alone does not establish source authenticity.
- Harden or split `scripts/report-upstream-drift.ts` so skill drift uses each manifest entry’s explicit repository/commit/path and reports added/removed/changed/unchanged plus missing source roots; preserve existing persona-method drift semantics.
- Reject `unknown-unpinned` provenance for release.

## G6 — Package declarations and archive gates

- Update `package.json#pi.skills` to the exact 87-entry list and retain `files: ["skills", ...]`; do not add dependencies or `skillPath`.
- Extend `test/package-gates.test.ts` to assert exact manifest/discovery inventory, each declaration’s disk resolution, tarball inclusion of all skills/support files, and absence of tests/plans/temp checkouts/caches.
- Ensure verifier rules distinguish standalone `skills/<vendor>` from forbidden shared persona corpus.

## G7 — Installed closure and discovery

- Extend `test/package-install.test.ts` to install a real `.tgz`, parse installed `package.json`, resolve every `pi.skills` entry inside the installed package, verify every `SKILL.md` and manifest support file, and retain uninstall/collateral assertions.
- Add `test/skill-reference-closure.test.ts` against the real packed/install tree. Recursively validate local references with the G3 resolver, verify both families' manifest-listed static support mappings, and classify gstack host-runtime references as external requirements. Do not claim packaged assets satisfy unchanged host paths. Ordinary tests require neither temporary source clones nor network retrieval.
- Add the G1 discovery integration/fixture test if existing Pi tooling supports it; otherwise keep the release-blocking evidence requirement explicit.

## G8 — Preserve persona boundary and policy

- Extend `test/persona-files.test.ts` and/or verifier-negative tests to assert all ten personas remain independently valid, retain `inheritSkills: true`, have no `skillPath`, and contain unchanged required inline methods/body hashes and policy invariants.
- Keep `skills/<vendor>` out of required-method resolution; prove no persona references it as a method source.
- Update `scripts/verify-no-shared-corpus.ts` and `test/verifier-negative.test.ts` only as needed to allow standalone vendor skills while continuing to reject shared/generated corpus and external method loading.

## G9 — Drift, documentation, and provenance record

- Add `test/vendor-provenance-and-drift.test.ts` for unchanged/added/changed/removed/bad-hash/wrong-path/wrong-commit/unpinned/missing-root cases. Source-root failures belong to source comparison tests. Prove offline integrity without clones and import rerun idempotence.
- Update `README.md`, `docs/compatibility.md`, the appropriate authoring/architecture doc, and `CHANGELOG.md` with catalog counts, source pins, discovery behavior, manifest/import/update commands, both families' support closure and logical mappings, gstack external-runtime limitation, and ambient-skill non-dependency rule. Keep unrelated documentation repairs outside this change.
- Update `LICENSE` or add `NOTICE` only after G2 verification; include it in the package file list.

## G10 — Release-readiness checks

Run, in order: deterministic import rerun (zero diff); pinned-source comparison against verified aggregate/origin roots; offline `scripts/verify-vendored-skills.ts`; resolver/manifest/drift tests; persona/policy tests; `test/package-gates.test.ts`; real `test/package-install.test.ts`; Pi discovery integration; `bun run typecheck`; `bun run verify:personas`; `bun run verify:no-shared-corpus`; full `bun test test/*.test.ts`; and `npm pack --dry-run --json`. Inspect the archive and installed tree manually/with assertions. No lint command is currently configured; run existing lint/static checks if available, without adding dependencies. Release is blocked by any closure, provenance, license, discovery, inventory, persona-boundary, or dependency failure. Local implementation commits use the repository's Lore protocol; remote publishing needs separate authorization.

## Change-set boundaries

Expected implementation files: `package.json`; `skills/vendor-manifest.json`; 86 vendored skill directories plus exact supporting documents from both families; `scripts/import-vendored-skills.ts`; `scripts/verify-vendored-skills.ts`; drift/source comparison script (harden or dedicated skill script); `test/package-gates.test.ts`; `test/package-install.test.ts`; new closure/provenance/discovery tests; persona/verifier tests only for boundary assertions; README/docs/license/notice/changelog. No persona method corpus, runtime shim, dependency, generated runtime artifact, or unrelated file.
