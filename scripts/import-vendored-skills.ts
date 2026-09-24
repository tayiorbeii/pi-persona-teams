#!/usr/bin/env bun
// Vendor the pinned upstream skills (42 Wondel.ai + 44 gstack) into
// pi-persona-teams per plans/16-BUNDLED-SKILLS-PLAN.md.
//
// Inputs are explicit, verified source roots (repository identity + commit
// pins are checked before anything is written):
//   --aggregate <paperclip-factory-kit checkout>  (tayiorbeii/paperclip-factory-kit @ 86038fa…)
//   --wondel   <wondelai/skills checkout>         (wondelai/skills @ 7c71a84…)
//   --gstack   <garrytan/gstack checkout>         (garrytan/gstack @ 25cf5ed…)
//   [--verify-upstream]  additionally hash origin-checkout files against the
//                        provenance digests recorded in the aggregate's
//                        frontmatter (network-free; uses the checkouts).
//
// Outputs are deterministic (sorted, no timestamps): skills/<slug>/… copies,
// skills/vendor-manifest.json, and the package.json pi.skills registration.
// Identical reruns against identical roots produce a zero diff.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ADAPTATION_VERSION, adaptGstackSkill } from "./skill-adaptations/pi-gstack-v1.ts";
import { relativeMarkdownLinks } from "./lib/markdown-links.ts";

const PINS = {
  aggregate: {
    repoSlug: "tayiorbeii/paperclip-factory-kit",
    commit: "86038facb8be556bf66fd945271eff2c51308fd1",
  },
  wondel: { repoSlug: "wondelai/skills", commit: "7c71a845071e8f994253db0d26c7e36fa90e2b5e" },
  gstack: { repoSlug: "garrytan/gstack", commit: "25cf5edf210fee2cd296ffb2dfb2eff370ebcf35" },
} as const;

// The plan's audited 86-skill inventory. Membership is a gate, not an
// observation: a drifted aggregate fails the import instead of silently
// vendoring a different corpus.
const PLAN_WONDEL = "37signals-way blue-ocean-strategy clean-architecture clean-code contagious continuous-discovery cro-methodology crossing-the-chasm ddia-systems design-everyday-things design-sprint domain-driven-design drive-motivation high-perf-browser hooked-ux hundred-million-offers improve-retention influence-psychology inspired-product ios-hig-design jobs-to-be-done lean-startup lean-ux made-to-stick microinteractions mom-test negotiation obviously-awesome one-page-marketing pragmatic-programmer predictable-revenue refactoring-patterns refactoring-ui release-it scorecard-marketing software-design-philosophy storybrand-messaging system-design top-design traction-eos ux-heuristics web-typography".split(" ");
const PLAN_GSTACK = "gstack-autoplan gstack-benchmark gstack-benchmark-models gstack-browse gstack-canary gstack-careful gstack-codex gstack-context-restore gstack-context-save gstack-cso gstack-design-consultation gstack-design-html gstack-design-review gstack-design-shotgun gstack-devex-review gstack-document-generate gstack-document-release gstack-freeze gstack-guard gstack-health gstack-investigate gstack-land-and-deploy gstack-landing-report gstack-learn gstack-make-pdf gstack-office-hours gstack-open-gstack-browser gstack-pair-agent gstack-plan-ceo-review gstack-plan-design-review gstack-plan-devex-review gstack-plan-eng-review gstack-plan-tune gstack-qa gstack-qa-only gstack-retro gstack-review gstack-scrape gstack-setup-browser-cookies gstack-setup-deploy gstack-ship gstack-skillify gstack-sync-gbrain gstack-unfreeze".split(" ");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(`import-vendored-skills: ${message}`);
  process.exit(1);
}

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Verify a checkout's HEAD commit and that its origin URL names the pinned repo. */
function verifyRoot(kind: keyof typeof PINS, root: string): void {
  const pin = PINS[kind];
  if (!existsSync(join(root, ".git"))) fail(`${kind} root '${root}' is not a git checkout`);
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const head = git(["rev-parse", "HEAD"]);
  if (head !== pin.commit) fail(`${kind} root '${root}' is at ${head}, expected pinned ${pin.commit}`);
  const origin = git(["remote", "get-url", "origin"]).toLowerCase();
  if (!origin.includes(pin.repoSlug.toLowerCase())) {
    fail(`${kind} root '${root}' origin '${origin}' does not name ${pin.repoSlug}`);
  }
}

interface SourceRecord {
  repo?: string;
  path?: string;
  commit?: string;
  sha256?: string;
  attribution?: string;
  license?: string;
}

/** Minimal frontmatter parse for the machine-generated kit format. */
function parseFrontmatter(content: string): { frontmatter: string; body: string; sources: SourceRecord[]; description: string; license?: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) fail("skill content is missing frontmatter");
  const frontmatter = match[1];
  const sources: SourceRecord[] = [];
  let current: SourceRecord | undefined;
  let inSources = false;
  let description = "";
  let inDescription = false;
  let license: string | undefined;
  for (const line of frontmatter.split("\n")) {
    if (/^metadata:/.test(line)) { inSources = false; inDescription = false; continue; }
    if (/^\s+sources:\s*$/.test(line)) { inSources = true; current = undefined; continue; }
    if (inSources && /^\s+-\s*$/.test(line)) { current = {}; sources.push(current); continue; }
    if (inSources && current && /^\s+(\w+):\s*(.*)$/.test(line)) {
      const [, key, value] = line.match(/^\s+(\w+):\s*(.*)$/)!;
      if (key in current) (current as Record<string, string>)[key] = value.trim().replace(/^["']|["']$/g, "");
      continue;
    }
    if (Object.keys(current ?? {}).length > 0 && /^\s{4,}\S/.test(line)) continue; // continuation lines inside a source record
    if (/^description:\s*\|/.test(line)) { inDescription = true; continue; }
    if (inDescription) {
      if (/^\s/.test(line)) { description += (description ? " " : "") + line.trim(); continue; }
      inDescription = false;
    }
    const licenseMatch = line.match(/^license:\s*(.+)$/);
    if (licenseMatch) license = licenseMatch[1].trim();
    if (/^\S/.test(line) && !line.startsWith("description:")) inSources = false;
  }
  return { frontmatter, body: content.slice(match[0].length), sources, description: description.trim(), license };
}

/** Recursive closure check: every relative .md link inside dir resolves inside dir. */
function verifyLinkClosure(dir: string): { files: number; unresolved: string[] } {
  const unresolved: string[] = [];
  let files = 0;
  const walk = (sub: string) => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true }) as Array<{ isFile(): boolean; isDirectory(): boolean; name: string }>) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { walk(rel); continue; }
      if (!entry.name.endsWith(".md")) continue;
      files += 1;
      const content = readFileSync(join(dir, rel), "utf8");
      for (const link of relativeMarkdownLinks(content)) {
        const target = resolve(dir, rel, "..", link);
        const relToRoot = relative(dir, target);
        if (relToRoot.startsWith("..") || !existsSync(target)) unresolved.push(`${rel} -> ${link}`);
      }
    }
  };
  walk("");
  return { files, unresolved };
}

function copyReferences(originRoot: string, slug: string, destDir: string): Array<{ path: string; byteCount: number; sha256: string }> {
  const originDir = join(originRoot, slug, "references");
  const copied: Array<{ path: string; byteCount: number; sha256: string }> = [];
  if (!existsSync(originDir)) return copied;
  const walk = (sub: string) => {
    for (const entry of readdirSync(join(originDir, sub), { withFileTypes: true }) as Array<{ isFile(): boolean; isDirectory(): boolean; name: string }>) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { walk(rel); continue; }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const data = readFileSync(join(originDir, rel));
        mkdirSync(join(destDir, "references", sub ? sub.split("/").slice(0, -1).join("/") : ""), { recursive: true });
        writeFileSync(join(destDir, "references", rel), data);
        copied.push({ path: `references/${rel}`, byteCount: data.byteLength, sha256: sha256(data) });
      }
    }
  };
  walk("");
  return copied.sort((a, b) => a.path.localeCompare(b.path));
}

// --- main ---

const root = resolve(import.meta.dir, "..");
const aggregate = arg("--aggregate");
const wondelRoot = arg("--wondel");
const gstackRoot = arg("--gstack");
const verifyUpstream = process.argv.includes("--verify-upstream");
if (!aggregate || !wondelRoot || !gstackRoot) {
  fail("usage: bun scripts/import-vendored-skills.ts --aggregate <kit> --wondel <checkout> --gstack <checkout> [--verify-upstream]");
}
verifyRoot("aggregate", resolve(aggregate));
verifyRoot("wondel", resolve(wondelRoot));
verifyRoot("gstack", resolve(gstackRoot));

const kitSkillsDir = join(resolve(aggregate), "skills");
const actual = readdirSync(kitSkillsDir, { withFileTypes: true })
  .filter((e: { isDirectory(): boolean; name: string }) => e.isDirectory() && existsSync(join(kitSkillsDir, e.name, "SKILL.md")))
  .map((e: { name: string }) => e.name)
  .sort();
const actualGstack = actual.filter((s: string) => s.startsWith("gstack-"));
const actualWondel = actual.filter((s: string) => !s.startsWith("gstack-"));
if (actualGstack.join() !== [...PLAN_GSTACK].sort().join()) fail("aggregate gstack slugs drifted from the plan inventory");
if (actualWondel.join() !== [...PLAN_WONDEL].sort().join()) fail("aggregate Wondel slugs drifted from the plan inventory");

const skillsDir = join(root, "skills");
mkdirSync(skillsDir, { recursive: true });
const entries: Array<Record<string, unknown>> = [];
const problems: string[] = [];

for (const slug of actual) {
  const family = slug.startsWith("gstack-") ? "gstack" : "wondel";
  const kitPath = join(kitSkillsDir, slug, "SKILL.md");
  const kitContent = readFileSync(kitPath, "utf8");
  const parsed = parseFrontmatter(kitContent);
  const destDir = join(skillsDir, slug);
  mkdirSync(destDir, { recursive: true });
  const source = parsed.sources[0] ?? {};

  if (verifyUpstream && source.repo && source.path && source.sha256) {
    const originRoot = family === "wondel" ? resolve(wondelRoot) : resolve(gstackRoot);
    const upstreamPath = join(originRoot, source.path);
    if (!existsSync(upstreamPath)) problems.push(`${slug}: upstream source file missing at ${source.path}`);
    else if (sha256(readFileSync(upstreamPath)) !== source.sha256) problems.push(`${slug}: upstream digest mismatch for ${source.path}`);
  }

  let packaged: string;
  let classification: string;
  let adaptation: Record<string, unknown> | undefined;
  if (family === "gstack") {
    const result = adaptGstackSkill(kitContent);
    if (!result) { problems.push(`${slug}: aggregate content lacks the recorded kit preamble-patch tag; adaptation aborted`); continue; }
    packaged = result.content;
    classification = "adapted-pi";
    adaptation = { version: ADAPTATION_VERSION, transform: "pi-gstack-v1", reviewed: false, removedAllowedTools: result.removedAllowedTools };
  } else {
    packaged = kitContent;
    classification = "vendored-unchanged";
  }
  writeFileSync(join(destDir, "SKILL.md"), packaged);

  const support = family === "wondel" ? copyReferences(resolve(wondelRoot), slug, destDir) : [];
  const closure = verifyLinkClosure(destDir);
  if (closure.unresolved.length > 0) problems.push(`${slug}: ${closure.unresolved.length} unresolved relative links (e.g. ${closure.unresolved[0]})`);

  entries.push({
    slug,
    family,
    destination: `skills/${slug}/SKILL.md`,
    source: {
      repo: source.repo ?? (family === "wondel" ? "wondelai/skills" : "garrytan/gstack"),
      path: source.path ?? `${slug}/SKILL.md`,
      commit: source.commit ?? PINS[family].commit,
      ...(source.sha256 ? { sourceSha256: source.sha256 } : {}),
    },
    attribution: source.attribution ?? (family === "wondel" ? "Wondel.ai" : "gstack / Garry Tan"),
    license: source.license ?? parsed.license ?? "MIT",
    byteCount: new TextEncoder().encode(packaged).length,
    packagedSha256: sha256(packaged),
    classification,
    ...(adaptation ? { adaptation } : {}),
    ...(support.length > 0 ? { supportFiles: support } : {}),
    linkClosure: { markdownFiles: closure.files, unresolvedLinks: closure.unresolved.length },
  });
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`  ! ${problem}`);
  fail(`${problems.length} integrity problem(s); nothing registered`);
}

const manifest = {
  schemaVersion: 1,
  aggregate: { repo: PINS.aggregate.repoSlug, commit: PINS.aggregate.commit, root: "skills/" },
  origins: {
    wondel: { repo: PINS.wondel.repoSlug, commit: PINS.wondel.commit },
    gstack: { repo: PINS.gstack.repoSlug, commit: PINS.gstack.commit },
  },
  adaptation: { piGstackVersion: ADAPTATION_VERSION, transform: "scripts/skill-adaptations/pi-gstack-v1.ts" },
  entryCount: entries.length,
  entries: entries.sort((a, b) => String(a.slug).localeCompare(String(b.slug))),
};
writeFileSync(join(skillsDir, "vendor-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// Deterministic registration: existing persona-team entry first, then the 86 slugs sorted.
const packagePath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { pi?: { skills?: string[] } };
const registrations = ["./skills/persona-team", ...[...PLAN_WONDEL, ...PLAN_GSTACK].sort().map((slug) => `./skills/${slug}`)];
pkg.pi = { ...(pkg.pi ?? {}), skills: registrations };
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`vendored ${entries.length} skills (${actualWondel.length} Wondel unchanged, ${actualGstack.length} gstack adapted-pi v${ADAPTATION_VERSION})`);
console.log(`registered ${registrations.length} pi.skills entries`);
console.log(verifyUpstream ? "upstream digest verification: performed" : "upstream digest verification: skipped (pass --verify-upstream to run)");
