# Canonical specification: vendor every upstream skill

Prepared with installed `pi-plan` run `20260916182830-rx5pjt` on 2026-09-16, then corrected through an independent native review. These tracked planning documents supersede the initial ignored runtime drafts; this work does not import skills or change product behavior.

Review history: the initial corrected plan passed independent native review by `/root/packaging_review` on 2026-09-16. The user subsequently clarified that only gstack's skill content belongs in Pi personas, with no gstack tooling dependency. This revision replaces unchanged gstack runtime instructions with reviewed Pi-native adaptations. Review of this revision is recorded below; implementation gates remain unproven.

Current revision: **PASS**, independent native reviewer `/root/pi_native_skill_review`, 2026-09-16. No blocking contradiction between Pi-native adaptation, provenance verification, persona integration, or existing authority boundaries was found. This is a plan review, not verification of imported skill behavior.

## Objective and non-negotiable boundaries

Package every skill in the pinned checkout `/tmp/pi-persona-skills-upstream-20260916` at `86038facb8be556bf66fd945271eff2c51308fd1` into `pi-persona-teams` as checked-in, independently discoverable Pi skills. Do not implement in this planning run.

- No new dependencies, push, PR, or release automation is authorized.
- Preserve the ten canonical personas, their independent inline `pi-persona-method:v1` bodies, identity/hash validation, child binding, ledger/attestation flow, role policy, and protected-path enforcement.
- Do not add `skillPath`, a shared method/skill corpus, runtime method loader, or `methods/`, `roles/`, `corpus/`, `generated/`, or `shared-skills/` directories.
- Vendored skills are standalone ambient Pi skills; they are not persona required methods and must never be loaded as a replacement for inline methods.
- Personas integrate the packaged skills through their existing `inheritSkills: true` discovery. Adapt gstack-derived skill instructions to Pi's current tools and persona authority; do not install, invoke, or require gstack binaries, browser daemons, state, setup helpers, or Claude-specific runtime APIs. Existing independent mandatory methods remain inline.

## Verified upstream baseline (implementation input)

The pinned checkout audit found exactly 86 files below `skills/`, all named `SKILL.md`, with no other supporting files in that checkout:

- 42 Wondel.ai: `37signals-way`, `blue-ocean-strategy`, `clean-architecture`, `clean-code`, `contagious`, `continuous-discovery`, `cro-methodology`, `crossing-the-chasm`, `ddia-systems`, `design-everyday-things`, `design-sprint`, `domain-driven-design`, `drive-motivation`, `high-perf-browser`, `hooked-ux`, `hundred-million-offers`, `improve-retention`, `influence-psychology`, `inspired-product`, `ios-hig-design`, `jobs-to-be-done`, `lean-startup`, `lean-ux`, `made-to-stick`, `microinteractions`, `mom-test`, `negotiation`, `obviously-awesome`, `one-page-marketing`, `pragmatic-programmer`, `predictable-revenue`, `refactoring-patterns`, `refactoring-ui`, `release-it`, `scorecard-marketing`, `software-design-philosophy`, `storybrand-messaging`, `system-design`, `top-design`, `traction-eos`, `ux-heuristics`, `web-typography`.
- 44 gstack: `gstack-autoplan`, `gstack-benchmark`, `gstack-benchmark-models`, `gstack-browse`, `gstack-canary`, `gstack-careful`, `gstack-codex`, `gstack-context-restore`, `gstack-context-save`, `gstack-cso`, `gstack-design-consultation`, `gstack-design-html`, `gstack-design-review`, `gstack-design-shotgun`, `gstack-devex-review`, `gstack-document-generate`, `gstack-document-release`, `gstack-freeze`, `gstack-guard`, `gstack-health`, `gstack-investigate`, `gstack-land-and-deploy`, `gstack-landing-report`, `gstack-learn`, `gstack-make-pdf`, `gstack-office-hours`, `gstack-open-gstack-browser`, `gstack-pair-agent`, `gstack-plan-ceo-review`, `gstack-plan-design-review`, `gstack-plan-devex-review`, `gstack-plan-eng-review`, `gstack-plan-tune`, `gstack-qa`, `gstack-qa-only`, `gstack-retro`, `gstack-review`, `gstack-scrape`, `gstack-setup-browser-cookies`, `gstack-setup-deploy`, `gstack-ship`, `gstack-skillify`, `gstack-sync-gbrain`, `gstack-unfreeze`.

Every audited file has frontmatter and source metadata. Origin pins are Wondel `wondelai/skills@7c71a845071e8f994253db0d26c7e36fa90e2b5e` and gstack `garrytan/gstack@25cf5edf210fee2cd296ffb2dfb2eff370ebcf35`; the aggregate selecting checkout is the Paperclip Factory Kit commit above. Recompute all hashes from the pinned checkout during implementation; do not copy a report digest as authority (the reported `gstack-design-html` digest was truncated/anomalous).

## Blocking portability and runtime findings

1. All 42 Wondel files contain relative `references/*.md` links: 266 unique relative targets were observed, including 254 missing `references/*.md` targets (plus anchors). The pinned checkout contains none. Before any release, recover the exact files from the pinned Wondel origin commit, preserving relative topology, or explicitly stop the rollout as blocked. Never invent references, silently waive closure, or claim all skills are portable.
2. The 44 gstack files currently contain Claude/gstack assumptions. Preserve their useful methodology, review criteria, checklists, and output contracts while adapting active instructions to Pi. Remove gstack helper invocations, setup/upgrade/telemetry hooks, daemon requirements, `.gstack` state conventions, and Claude-only APIs. Recover relevant static documents from the pinned origin, including review checklists and specialist guidance, and adapt tool-specific instructions there too. Rewrite document paths to packaged relative links. Keep `gstack-*` slugs for traceability; the prefix is content provenance, not a tooling requirement.
3. Adapt cross-skill command invocations into references to discovered Pi skills. Replace tool operations only where an existing Pi capability and the persona's authority support the same purpose. For unavailable capabilities, retain useful analysis and route necessary environment work to the parent with explicit evidence requirements; never invent tool names, silently broaden authority, or require gstack. Tool-centric skills retain their identity and expose the portable purpose, supported operations, and bounded unavailable-capability behavior.
4. `octocode-research`, `ponytail`, and `i-have-adhd` are ambient host skills, not upstream vendor entries. Do not vendor, declare, pin, or make persona compliance depend on them; isolated persona validation must work without them.
5. Verify actual Pi package discovery semantics before implementation. If existing Pi tooling cannot prove installed `pi.skills` discovery without a new dependency, the discovery acceptance criterion remains a release blocker, not an undocumented gap.

## Manifest and content policy

Add `skills/vendor-manifest.json` as the canonical generated-but-reviewed inventory. It must record schema version, aggregate checkout repository/path/commit, and one entry for every physical packaged vendored file. Each entry records destination, source repository/path/commit, source license and attribution, byte count, source SHA-256, packaged SHA-256, and runtime/closure classification. Record both aggregate Paperclip provenance and Wondel/gstack origin provenance; include exact license-file source/hash and required notice text or a `NOTICE` file when needed. Support files recovered from either family are manifest entries too. Record authored host-path support references separately from true package-relative links and external executable/state requirements.

Copy Wondel methodology content unchanged where portable. Adapt gstack skills and their static supporting documents before registering them for discovery. Preserve source attribution and pinned original hashes; separately record packaged hashes, adaptation version, rationale, and reviewed source-to-Pi changes. Never require original and packaged hashes to match for an intentional adaptation. Use package-relative supporting-document paths, manifest every physical copy, and scope undeclared-file checks to imported directories rather than existing `skills/persona-team` content. Do not register raw unadapted gstack instructions as active skills.

Add `scripts/import-vendored-skills.ts` using existing Node/Bun APIs. Require explicit aggregate, Wondel, and gstack source roots; verify all recorded repository identities and commit pins before import. Apply checked-in, reviewed compatibility patches from `scripts/skill-adaptations/`, failing on a mismatched source or patch context. Generate sorted inventory, support mappings, original/adapted hashes, and the 87 registrations deterministically. Preserve existing persona-team content. Identical sources and adaptations must yield zero diff; do not include temporary paths or changing timestamps.

Separate two verification modes. Offline integrity checks and ordinary package tests use only the checked-in manifest and packaged files, requiring neither network nor the temporary research clone. A dedicated pinned-source comparison, using explicit source roots, verifies repository/commit identity and source bytes against the manifest. Missing-source-root cases belong to the latter command. Hash agreement with a local manifest alone does not prove original-source authenticity.

## Testable acceptance criteria

- Exactly 86 upstream skill slugs are present once each, plus existing `skills/persona-team/SKILL.md`; no upstream skill is omitted or duplicated.
- `package.json#pi.skills` contains the existing persona-team entry plus exactly those 86 entries, in the documented deterministic order; every entry resolves to an in-package `SKILL.md`, and `files` still publishes `skills`.
- Manifest inventory, pins, identities, sizes, and original/adapted hashes match their respective sources and packaged outputs. Every adaptation is attributed, recorded, reproducible, and independently reviewed. Unknown provenance, duplicates, missing files, unrecorded modifications, or mismatched hashes fail.
- Wondel local Markdown references resolve recursively in a real packed tarball/isolated install, with fragments/query stripped, external schemes ignored, fenced/inline code ignored, traversal/symlink escapes rejected, and missing origin support files blocking release.
- All 44 gstack-derived skills are adapted to existing Pi capabilities, with complete relevant static support and resolving relative links. Active instructions require no gstack installation, helpers, state, daemon, host paths, or Claude-only APIs. Regression fixtures detect residual operational dependencies; independent content review checks methodology preservation and sensible Pi behavior beyond string matching.
- Personas discover and use the adapted skills within existing policy and tool allowlists. A bounded isolated persona test demonstrates applying a representative gstack-derived review skill without any gstack installation. Missing capabilities produce a bounded report/parent handoff rather than setup commands or authority expansion.
- Ten canonical personas pass isolated-copy validation with unchanged identity/body/policy invariants, retain `inheritSkills: true`, declare no `skillPath`, and do not reference vendored skills as method sources.
- Existing no-shared-corpus/verifier-negative gates continue rejecting shared methods, generated persona output, external method loading, and `skillPath`.
- Packed archive and real install contain every declared skill and manifest-listed support file and no tests/plans/temp checkout/cache artifacts; uninstall preserves collateral files.
- Provenance/drift checks cover unchanged, added, changed, removed, bad-hash, wrong-path, wrong-commit, and missing-source-root cases and compare explicit repository/commit/path rather than a guessed layout. Offline checks succeed without any source checkout; pinned-source comparison fails on missing or mismatched roots. Identical import reruns produce no diff.
- Installed Pi's actual discovery API returns all 87 skill identities from the isolated installed package. Manifest parsing or path existence alone is insufficient evidence; a fixture must invoke that discovery API.
- Relevant tests, package gates, real pack/install, and documented verification commands pass; no new dependency is introduced.
- License/attribution terms are verified before release and are sufficient for both upstream families.

## Update policy

For each intentional update, pin the new checkout, review source changes and refresh explicit Pi compatibility patches, run the importer against pinned roots, recover relevant static support, verify source and adapted output hashes, and review every changed instruction for methodology preservation and residual gstack dependencies. Update content/manifest/patches/registration/tests/docs together and run integrity, closure, persona/policy, discovery, pack/install, and full tests. Unmatched patches and unreviewed or unrecorded changes block import/release; never overwrite Pi adaptations with raw upstream instructions.

## Honest gaps

The current repository has no real Pi-host discovery/inheritSkills integration test, installed reference-closure test, drift-script tests, or Pi adaptations of these 44 gstack skills. Full supporting-document recovery, per-skill capability mapping, methodology-preservation review, source/adapted hash verification, notices, and installed persona/discovery checks are execution work. No claim is made that unchanged gstack skills are already compatible with Pi.

## Evidence collected by the integration owner

- Baseline revision: `9a7f385`. All ten personas pass `bun run verify:personas`; `bun run verify:no-shared-corpus` and `bun run typecheck` pass. Focused discovery/persona tests: 8 pass, 0 fail.
- The installed Pi package documentation supports recursive `./skills` roots. This plan chooses explicit per-skill entries to keep registration equal to the audited manifest inventory; actual installed discovery still requires the integration test above.
- The pinned factory-kit checkout contains exactly 86 skill files and no support directories. [Pinned collection](https://github.com/tayiorbeii/paperclip-factory-kit/tree/86038facb8be556bf66fd945271eff2c51308fd1/skills).
- GitHub's contents API confirms six `clean-code/references` files exist at the recorded Wondel commit. [Pinned supporting files](https://github.com/wondelai/skills/tree/7c71a845071e8f994253db0d26c7e36fa90e2b5e/clean-code/references).
- GitHub's contents API confirms gstack review includes `TODOS-format.md`, `checklist.md`, `design-checklist.md`, `greptile-triage.md`, and `specialists` at its recorded commit. [Pinned supporting files](https://github.com/garrytan/gstack/tree/25cf5edf210fee2cd296ffb2dfb2eff370ebcf35/review).
- Factory-kit `LICENSE` includes the Taylor Bell, Wondel.ai, and Garry Tan MIT notices. Retain the full applicable notices in the distributable package. [Pinned license](https://github.com/tayiorbeii/paperclip-factory-kit/blob/86038facb8be556bf66fd945271eff2c51308fd1/LICENSE).
