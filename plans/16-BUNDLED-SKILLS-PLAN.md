# Canonical specification: vendor every upstream skill

Prepared with installed `pi-plan` run `20260916182830-rx5pjt` on 2026-09-16, then corrected through an independent native review. These tracked planning documents supersede the initial ignored runtime drafts; this work does not import skills or change product behavior.

Review status: **PASS**, independent native reviewer `/root/packaging_review`, 2026-09-16. The initial workflow draft received REVISE; all five native-review corrections were applied before the final PASS. This is a planning review, not a Pi persona attestation or proof of implementation readiness. Complete support recovery, redistribution notices, and installed discovery remain explicit execution gates.

## Objective and non-negotiable boundaries

Package every skill in the pinned checkout `/tmp/pi-persona-skills-upstream-20260916` at `86038facb8be556bf66fd945271eff2c51308fd1` into `pi-persona-teams` as checked-in, independently discoverable Pi skills. Do not implement in this planning run.

- No new dependencies, push, PR, or release automation is authorized.
- Preserve the ten canonical personas, their independent inline `pi-persona-method:v1` bodies, identity/hash validation, child binding, ledger/attestation flow, role policy, and protected-path enforcement.
- Do not add `skillPath`, a shared method/skill corpus, runtime method loader, or `methods/`, `roles/`, `corpus/`, `generated/`, or `shared-skills/` directories.
- Vendored skills are standalone ambient Pi skills; they are not persona required methods and must never be loaded as a replacement for inline methods.

## Verified upstream baseline (implementation input)

The pinned checkout audit found exactly 86 files below `skills/`, all named `SKILL.md`, with no other supporting files in that checkout:

- 42 Wondel.ai: `37signals-way`, `blue-ocean-strategy`, `clean-architecture`, `clean-code`, `contagious`, `continuous-discovery`, `cro-methodology`, `crossing-the-chasm`, `ddia-systems`, `design-everyday-things`, `design-sprint`, `domain-driven-design`, `drive-motivation`, `high-perf-browser`, `hooked-ux`, `hundred-million-offers`, `improve-retention`, `influence-psychology`, `inspired-product`, `ios-hig-design`, `jobs-to-be-done`, `lean-startup`, `lean-ux`, `made-to-stick`, `microinteractions`, `mom-test`, `negotiation`, `obviously-awesome`, `one-page-marketing`, `pragmatic-programmer`, `predictable-revenue`, `refactoring-patterns`, `refactoring-ui`, `release-it`, `scorecard-marketing`, `software-design-philosophy`, `storybrand-messaging`, `system-design`, `top-design`, `traction-eos`, `ux-heuristics`, `web-typography`.
- 44 gstack: `gstack-autoplan`, `gstack-benchmark`, `gstack-benchmark-models`, `gstack-browse`, `gstack-canary`, `gstack-careful`, `gstack-codex`, `gstack-context-restore`, `gstack-context-save`, `gstack-cso`, `gstack-design-consultation`, `gstack-design-html`, `gstack-design-review`, `gstack-design-shotgun`, `gstack-devex-review`, `gstack-document-generate`, `gstack-document-release`, `gstack-freeze`, `gstack-guard`, `gstack-health`, `gstack-investigate`, `gstack-land-and-deploy`, `gstack-landing-report`, `gstack-learn`, `gstack-make-pdf`, `gstack-office-hours`, `gstack-open-gstack-browser`, `gstack-pair-agent`, `gstack-plan-ceo-review`, `gstack-plan-design-review`, `gstack-plan-devex-review`, `gstack-plan-eng-review`, `gstack-plan-tune`, `gstack-qa`, `gstack-qa-only`, `gstack-retro`, `gstack-review`, `gstack-scrape`, `gstack-setup-browser-cookies`, `gstack-setup-deploy`, `gstack-ship`, `gstack-skillify`, `gstack-sync-gbrain`, `gstack-unfreeze`.

Every audited file has frontmatter and source metadata. Origin pins are Wondel `wondelai/skills@7c71a845071e8f994253db0d26c7e36fa90e2b5e` and gstack `garrytan/gstack@25cf5edf210fee2cd296ffb2dfb2eff370ebcf35`; the aggregate selecting checkout is the Paperclip Factory Kit commit above. Recompute all hashes from the pinned checkout during implementation; do not copy a report digest as authority (the reported `gstack-design-html` digest was truncated/anomalous).

## Blocking portability and runtime findings

1. All 42 Wondel files contain relative `references/*.md` links: 266 unique relative targets were observed, including 254 missing `references/*.md` targets (plus anchors). The pinned checkout contains none. Before any release, recover the exact files from the pinned Wondel origin commit, preserving relative topology, or explicitly stop the rollout as blocked. Never invent references, silently waive closure, or claim all skills are portable.
2. All 44 gstack files retain external Claude/gstack assumptions; 43 reference `~/.claude/skills/gstack/bin/*`, most use `~/.gstack`, and many require Claude `AskUserQuestion`/`ExitPlanMode`, browser/Chrome/Playwright, GitHub CLI, Node/npm/Python, cloud providers, or model tooling. Recover static authored supporting documents from the pinned gstack origin too, including review checklists, `TODOS-format.md`, and `specialists/` as required by an audited dependency inventory. Inventory document paths in prose and code as well as Markdown links. Map logical origin assets explicitly into packaged skill directories. Vendor skill text unchanged, do not emulate runtimes, and retain `external-runtime-required`: recovered assets do not satisfy the unchanged `.claude/...` or `~/.claude/...` host-path assumptions. Document the destination mappings and remaining host setup requirements.
3. Conceptual cross-skill links and `/gstack-*` command references are authored content, not package-local paths. Preserve them unchanged and document their semantics.
4. `octocode-research`, `ponytail`, and `i-have-adhd` are ambient host skills, not upstream vendor entries. Do not vendor, declare, pin, or make persona compliance depend on them; isolated persona validation must work without them.
5. Verify actual Pi package discovery semantics before implementation. If existing Pi tooling cannot prove installed `pi.skills` discovery without a new dependency, the discovery acceptance criterion remains a release blocker, not an undocumented gap.

## Manifest and content policy

Add `skills/vendor-manifest.json` as the canonical generated-but-reviewed inventory. It must record schema version, aggregate checkout repository/path/commit, and one entry for every physical packaged vendored file. Each entry records destination, source repository/path/commit, source license and attribution, byte count, source SHA-256, packaged SHA-256, and runtime/closure classification. Record both aggregate Paperclip provenance and Wondel/gstack origin provenance; include exact license-file source/hash and required notice text or a `NOTICE` file when needed. Support files recovered from either family are manifest entries too. Record authored host-path support references separately from true package-relative links and external executable/state requirements.

Initial `skills/<slug>/SKILL.md` files are byte-for-byte copies. Do not rewrite links/frontmatter/runtime instructions. Support files, if recoverable, must be placed at the destination that preserves each original relative path; manifest every physical copy and define deterministic handling for duplicates. Scope undeclared-file checks to vendored skill directories/manifest closure, not the existing `skills/persona-team` skill.

Add `scripts/import-vendored-skills.ts` using existing Node/Bun APIs. Require explicit aggregate, Wondel, and gstack source roots; verify all recorded repository identities and commit pins before import. Generate sorted file inventory, explicit support mappings, hashes, and the 87 per-skill registrations deterministically. Preserve existing persona-team content. A rerun against identical roots must produce zero diff; do not include temporary paths or changing timestamps in generated output.

Separate two verification modes. Offline integrity checks and ordinary package tests use only the checked-in manifest and packaged files, requiring neither network nor the temporary research clone. A dedicated pinned-source comparison, using explicit source roots, verifies repository/commit identity and source bytes against the manifest. Missing-source-root cases belong to the latter command. Hash agreement with a local manifest alone does not prove original-source authenticity.

## Testable acceptance criteria

- Exactly 86 upstream skill slugs are present once each, plus existing `skills/persona-team/SKILL.md`; no upstream skill is omitted or duplicated.
- `package.json#pi.skills` contains the existing persona-team entry plus exactly those 86 entries, in the documented deterministic order; every entry resolves to an in-package `SKILL.md`, and `files` still publishes `skills`.
- Manifest schema, inventory, provenance pins, frontmatter identity, byte counts, and SHA-256 values match the checked-in files and the pinned source; unpinned/unknown provenance, duplicates, missing files, unexpected vendor files, and digest mismatch fail.
- Wondel local Markdown references resolve recursively in a real packed tarball/isolated install, with fragments/query stripped, external schemes ignored, fenced/inline code ignored, traversal/symlink escapes rejected, and missing origin support files blocking release.
- gstack static support inventory and mapped assets are complete and hashed; true package-relative references resolve. Host-path references are explicitly mapped and remain documented external compatibility requirements, rather than being falsely reported as resolved. No gstack helper/runtime is added.
- Ten canonical personas pass isolated-copy validation with unchanged identity/body/policy invariants, retain `inheritSkills: true`, declare no `skillPath`, and do not reference vendored skills as method sources.
- Existing no-shared-corpus/verifier-negative gates continue rejecting shared methods, generated persona output, external method loading, and `skillPath`.
- Packed archive and real install contain every declared skill and manifest-listed support file and no tests/plans/temp checkout/cache artifacts; uninstall preserves collateral files.
- Provenance/drift checks cover unchanged, added, changed, removed, bad-hash, wrong-path, wrong-commit, and missing-source-root cases and compare explicit repository/commit/path rather than a guessed layout. Offline checks succeed without any source checkout; pinned-source comparison fails on missing or mismatched roots. Identical import reruns produce no diff.
- Installed Pi's actual discovery API returns all 87 skill identities from the isolated installed package. Manifest parsing or path existence alone is insufficient evidence; a fixture must invoke that discovery API.
- Relevant tests, package gates, real pack/install, and documented verification commands pass; no new dependency is introduced.
- License/attribution terms are verified before release and are sufficient for both upstream families.

## Update policy

For each intentional update, pin a new upstream checkout commit, run the deterministic importer against explicit aggregate/origin roots, recover/verify both families' static support and local closure, compare pinned-source bytes, review added/removed/changed/runtime-classified files, update manifest/content/package declarations/tests/docs/changelog together, and run offline vendor integrity, closure, persona/policy, package-gate, pack/install, and full test checks. Never hand-edit a vendored file without preserving original hash/provenance and documenting the compatibility patch. Do not release on closure, provenance, discovery, or license failure.

## Honest gaps

The current repository has no real Pi-host discovery/inheritSkills integration test, no installed reference-closure test, no drift-script tests, and no tracked CI/release automation. The implementation must first verify whether existing Pi tooling can add the discovery test without dependencies; otherwise this remains an explicit blocking gap. Both families' full support-file recovery, exact license sufficiency, and aggregate/origin provenance relationship are pre-vendoring evidence gates, not assumptions. Individual examples of recoverable files are verified below; complete closure is not yet proven.

## Evidence collected by the integration owner

- Baseline revision: `9a7f385`. All ten personas pass `bun run verify:personas`; `bun run verify:no-shared-corpus` and `bun run typecheck` pass. Focused discovery/persona tests: 8 pass, 0 fail.
- The installed Pi package documentation supports recursive `./skills` roots. This plan chooses explicit per-skill entries to keep registration equal to the audited manifest inventory; actual installed discovery still requires the integration test above.
- The pinned factory-kit checkout contains exactly 86 skill files and no support directories. [Pinned collection](https://github.com/tayiorbeii/paperclip-factory-kit/tree/86038facb8be556bf66fd945271eff2c51308fd1/skills).
- GitHub's contents API confirms six `clean-code/references` files exist at the recorded Wondel commit. [Pinned supporting files](https://github.com/wondelai/skills/tree/7c71a845071e8f994253db0d26c7e36fa90e2b5e/clean-code/references).
- GitHub's contents API confirms gstack review includes `TODOS-format.md`, `checklist.md`, `design-checklist.md`, `greptile-triage.md`, and `specialists` at its recorded commit. [Pinned supporting files](https://github.com/garrytan/gstack/tree/25cf5edf210fee2cd296ffb2dfb2eff370ebcf35/review).
- Factory-kit `LICENSE` includes the Taylor Bell, Wondel.ai, and Garry Tan MIT notices. Retain the full applicable notices in the distributable package. [Pinned license](https://github.com/tayiorbeii/paperclip-factory-kit/blob/86038facb8be556bf66fd945271eff2c51308fd1/LICENSE).
