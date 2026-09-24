import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = join(import.meta.dir, "..");

test("package exposes exactly ten agent files and no shared corpus", () => {
  const agents = readdirSync(join(root, "agents")).filter((name) => name.endsWith(".md")).sort();
  expect(agents).toEqual(["devex-lead.md", "engineering-manager.md", "founder-ceo.md", "implementation-engineer.md", "product-designer.md", "qa-lead.md", "release-engineer.md", "retro-ops-manager.md", "security-officer.md", "staff-reviewer.md"]);
  expect(existsSync(join(root, "roles"))).toBe(false);
  expect(existsSync(join(root, "methods"))).toBe(false);
  expect(existsSync(join(root, "corpus"))).toBe(false);
  expect(existsSync(join(root, "generated", "agents"))).toBe(false);
  expect(existsSync(join(root, "shared-skills"))).toBe(false);
  expect(execFileSync("bun", ["run", "verify:no-shared-corpus"], { cwd: root, encoding: "utf8" })).toContain("PASS");
});

test("method-copy provenance remains repository-relative", () => {
  const script = readFileSync(join(root, "scripts", "copy-method-into-persona.ts"), "utf8");
  expect(script).toContain("sourcePath: portableSourcePath");
  expect(script).not.toContain("sourcePath: resolve(sourcePath)");
});

test("package metadata and dry-run archive expose the installable runtime", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name: string;
    version: string;
    pi: { extensions: string[]; skills: string[]; subagents: { agents: string[] } };
    peerDependencies: Record<string, string>;
    files: string[];
  };
  expect(manifest.name).toBe("pi-persona-teams");
  expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(manifest.pi.extensions).toEqual(["./extensions/persona-parent.ts"]);
  expect(manifest.pi.skills).toEqual([
    "./skills/persona-team",
    ...readdirSync(join(root, "skills"), { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory() && dirent.name !== "persona-team")
      .map((dirent) => dirent.name)
      .sort()
      .map((name) => `./skills/${name}`),
  ]);
  expect(manifest.pi.skills.length).toBe(87);
  expect(manifest.pi.subagents.agents).toEqual(["./agents"]);
  expect(Object.keys(manifest.peerDependencies).sort()).toEqual(["@earendil-works/pi-coding-agent", "pi-subagents"]);
  expect(manifest.peerDependencies["@earendil-works/pi-coding-agent"]).toMatch(/\S+/);
  expect(manifest.peerDependencies["pi-subagents"]).toMatch(/\S+/);
  expect(manifest.files).toEqual(expect.arrayContaining(["agents", "extensions", "scripts", "schemas", "skills", "README.md", "CHANGELOG.md", "LICENSE"]));

  const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" })) as Array<{ name: string; version: string; files: Array<{ path: string }> }>;
  expect(packed).toHaveLength(1);
  expect(packed[0].name).toBe(manifest.name);
  expect(packed[0].version).toBe(manifest.version);
  const files = packed[0].files.map((file) => file.path);
  expect(files).toEqual(expect.arrayContaining([
    "package.json",
    "agents/engineering-manager.md",
    "extensions/persona-child.ts",
    "extensions/persona-parent.ts",
    "scripts/verify-personas.ts",
    "scripts/verify-no-shared-corpus.ts",
    "schemas/persona-attestation.v1.json",
    "skills/persona-team/SKILL.md",
    "skills/vendor-manifest.json",
    "skills/gstack-review/SKILL.md",
    "skills/clean-architecture/SKILL.md",
    "skills/clean-architecture/references/dependency-rule.md",
  ]));
  expect(files.some((file) => file.startsWith("test/") || file.startsWith("plans/") || file.startsWith(".tmp-attestations/"))).toBe(false);
}, 30_000);

test("package installs from npm pack and rolls back without collateral files", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "persona-package-smoke-"));
  const archiveDir = join(sandbox, "archive");
  const installDir = join(sandbox, "install");
  mkdirSync(archiveDir);
  mkdirSync(installDir);
  writeFileSync(join(installDir, "package.json"), JSON.stringify({ name: "rollback-fixture", version: "1.0.0", private: true }));
  writeFileSync(join(installDir, "keep.txt"), "keep this project file\n");
  try {
    const packed = JSON.parse(execFileSync("npm", ["pack", "--pack-destination", archiveDir, "--json"], { cwd: root, encoding: "utf8" })) as Array<{ name: string; version: string }>;
    expect(packed[0].name).toBe("pi-persona-teams");
    expect(packed[0].version).toBe("0.1.1");
    const archiveName = readdirSync(archiveDir).find((file) => file.endsWith(".tgz"));
    if (!archiveName) throw new Error("npm pack did not produce an archive");

    execFileSync("npm", ["install", "--ignore-scripts", "--no-save", "--no-package-lock", "--omit=peer", join(archiveDir, archiveName)], { cwd: installDir, encoding: "utf8" });
    const installedRoot = join(installDir, "node_modules", "pi-persona-teams");
    expect(existsSync(join(installedRoot, "extensions", "persona-parent.ts"))).toBe(true);
    expect(existsSync(join(installedRoot, "agents", "engineering-manager.md"))).toBe(true);

    execFileSync("npm", ["uninstall", "--ignore-scripts", "--no-save", "--no-package-lock", "pi-persona-teams"], { cwd: installDir, encoding: "utf8" });
    expect(existsSync(installedRoot)).toBe(false);
    expect(readFileSync(join(installDir, "keep.txt"), "utf8")).toBe("keep this project file\n");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}, 30_000);
