import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { relativeMarkdownLinks } from "../scripts/lib/markdown-links.ts";

const root = join(import.meta.dir, "..");
const skillsDir = join(root, "skills");
const manifest = JSON.parse(readFileSync(join(skillsDir, "vendor-manifest.json"), "utf8")) as {
  schemaVersion: number;
  aggregate: { repo: string; commit: string };
  origins: Record<string, { repo: string; commit: string }>;
  entryCount: number;
  entries: Array<{
    slug: string;
    family: string;
    destination: string;
    source: { repo: string; path: string; commit: string };
    byteCount: number;
    packagedSha256: string;
    classification: string;
    adaptation?: { version: number; reviewed: boolean };
    linkClosure: { markdownFiles: number; unresolvedLinks: number };
  }>;
};

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

describe("vendored skills manifest integrity (offline)", () => {
  test("manifest declares exactly the 86 pinned slugs", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.aggregate.commit).toBe("86038facb8be556bf66fd945271eff2c51308fd1");
    expect(manifest.origins.wondel.commit).toBe("7c71a845071e8f994253db0d26c7e36fa90e2b5e");
    expect(manifest.origins.gstack.commit).toBe("25cf5edf210fee2cd296ffb2dfb2eff370ebcf35");
    expect(manifest.entryCount).toBe(86);
    expect(manifest.entries.length).toBe(86);
    const slugs = manifest.entries.map((entry) => entry.slug).sort();
    expect(new Set(slugs).size).toBe(86);
    expect(slugs.filter((slug) => slug.startsWith("gstack-")).length).toBe(44);
    expect(slugs.filter((slug) => !slug.startsWith("gstack-")).length).toBe(42);
  });

  test("every entry matches its packaged file bytes and hash", () => {
    for (const entry of manifest.entries) {
      const path = join(root, entry.destination);
      expect(existsSync(path), entry.destination).toBe(true);
      const content = readFileSync(path);
      expect(sha256(content), `${entry.slug} sha`).toBe(entry.packagedSha256);
      expect(Buffer.byteLength(content, "utf8"), `${entry.slug} bytes`).toBe(entry.byteCount);
      expect(entry.linkClosure.unresolvedLinks, `${entry.slug} link closure`).toBe(0);
    }
  });

  test("no undeclared vendored skill directories", () => {
    const declared = new Set(manifest.entries.map((entry) => entry.slug).concat("persona-team"));
    const actual = readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    for (const dir of actual) expect(declared.has(dir), `unexpected skills/${dir}`).toBe(true);
    expect(actual.length).toBe(87);
  });

  test("package.json registers persona-team plus exactly the 86 slugs, deterministically ordered", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { pi?: { skills?: string[] } };
    const skills = pkg.pi?.skills ?? [];
    expect(skills.length).toBe(87);
    expect(skills[0]).toBe("./skills/persona-team");
    const rest = skills.slice(1);
    expect(rest).toEqual([...rest].sort());
    for (const entry of skills) expect(existsSync(join(root, entry, "SKILL.md")), entry).toBe(true);
  });

  test("gstack entries are Pi-adapted, provenance-carrying, and Claude-tool-free", () => {
    for (const entry of manifest.entries.filter((candidate) => candidate.family === "gstack")) {
      const content = readFileSync(join(root, entry.destination), "utf8");
      expect(entry.classification).toBe("adapted-pi");
      expect(entry.adaptation?.version).toBe(1);
      expect(content.includes("## Pi adaptation (vendored)"), entry.slug).toBe(true);
      expect(content.includes("garrytan/gstack"), `${entry.slug} provenance`).toBe(true);
      expect(/^allowed-tools:/m.test(content), `${entry.slug} allowed-tools removed`).toBe(false);
    }
  });

  test("wondel entries are unchanged vendored copies with recovered references", () => {
    for (const entry of manifest.entries.filter((candidate) => candidate.family === "wondel")) {
      expect(entry.classification).toBe("vendored-unchanged");
      expect(entry.adaptation).toBeUndefined();
      expect(entry.source.commit).toBe(manifest.origins.wondel.commit);
    }
    const wondelWithReferences = manifest.entries.filter((entry) => entry.family === "wondel" && (entry.linkClosure.markdownFiles ?? 0) > 1);
    expect(wondelWithReferences.length).toBeGreaterThan(30);
  });

  test("relative link closure holds on disk for every vendored skill", () => {
    for (const entry of manifest.entries) {
      const dir = join(skillsDir, entry.slug);
      const unresolved = collectUnresolvedLinks(dir);
      expect(unresolved, entry.slug).toEqual([]);
    }
  });
});

function collectUnresolvedLinks(dir: string): string[] {
  const unresolved: string[] = [];
  const walk = (sub: string) => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { walk(rel); continue; }
      if (!entry.name.endsWith(".md")) continue;
      const content = readFileSync(join(dir, rel), "utf8");
      for (const link of relativeMarkdownLinks(content)) {
        const target = resolve(dir, rel, "..", link);
        const relToRoot = relative(dir, target);
        if (relToRoot.startsWith("..") || !existsSync(target)) unresolved.push(`${rel} -> ${link}`);
      }
    }
  };
  walk("");
  return unresolved;
}
