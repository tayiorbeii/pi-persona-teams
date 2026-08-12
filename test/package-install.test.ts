import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const root = join(import.meta.dir, "..");

test("npm pack tarball installs and rolls back in an isolated prefix", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "persona-package-smoke-"));
  const archiveDirectory = join(temporaryRoot, "archive");
  const installPrefix = join(temporaryRoot, "install");
  const packageName = "pi-persona-teams";
  mkdirSync(archiveDirectory, { recursive: true });
  mkdirSync(installPrefix, { recursive: true });
  try {
    const packedName = execFileSync("npm", ["pack", "--silent", "--pack-destination", archiveDirectory], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).at(-1);
    if (!packedName) throw new Error("npm pack did not return an archive name");
    const archive = join(archiveDirectory, basename(packedName));
    expect(existsSync(archive)).toBe(true);

    execFileSync("npm", [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--legacy-peer-deps",
      "--package-lock=false",
      "--prefix",
      installPrefix,
      archive,
    ], { cwd: root, encoding: "utf8", stdio: "pipe" });

    const installedRoot = join(installPrefix, "node_modules", packageName);
    expect(JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8")).name).toBe(packageName);
    expect(existsSync(join(installedRoot, "agents", "engineering-manager.md"))).toBe(true);
    expect(existsSync(join(installedRoot, "extensions", "persona-child.ts"))).toBe(true);
    expect(existsSync(join(installedRoot, "scripts", "verify-personas.ts"))).toBe(true);

    execFileSync("npm", ["uninstall", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installPrefix, "--no-save", packageName], { cwd: root, encoding: "utf8", stdio: "pipe" });
    expect(existsSync(installedRoot)).toBe(false);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
