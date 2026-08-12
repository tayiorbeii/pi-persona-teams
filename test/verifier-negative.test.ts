import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const source = readFileSync(join(root, "agents", "engineering-manager.md"), "utf8");

function runBun(args: string[], cwd = root): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("bun", args, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function writePersona(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), "persona-verifier-"));
  const file = join(directory, "engineering-manager.md");
  writeFileSync(file, contents, "utf8");
  return file;
}

function verifyPersona(contents: string): { status: number | null; output: string } {
  const result = runBun(["scripts/verify-personas.ts", writePersona(contents)]);
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

const emptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const systemDesignBlock = source.match(/### Embedded Method: System Design[\s\S]*?(?=### Embedded Method:|## Completion Checklist)/)?.[0];
if (!systemDesignBlock) throw new Error("Engineering Manager fixture is missing the System Design method block");

const negativeCases: Array<{ name: string; source: string; message: string }> = [
  {
    name: "missing contract block",
    source: source.replace(/<!--\s*pi-persona-contract:v1[\s\S]*?-->/, ""),
    message: "missing persona contract",
  },
  {
    name: "duplicate contract block",
    source: source.replace(/<!--\s*pi-persona-contract:v1[\s\S]*?-->/, (block) => `${block}\n${block}`),
    message: "duplicate persona contract",
  },
  {
    name: "runtime identity mismatch",
    source: source.replace('"runtimeName": "persona-team.engineering-manager"', '"runtimeName": "persona-team.staff-reviewer"'),
    message: "contract runtimeName does not match role",
  },
  {
    name: "extra undeclared method",
    source: source.replace("## Completion Checklist", `${systemDesignBlock.replaceAll("persona-team-system-design", "persona-team-extra-method")}\n## Completion Checklist`),
    message: "undeclared embedded method: persona-team-extra-method",
  },
  {
    name: "duplicate embedded method ID",
    source: source.replace("## Completion Checklist", `${systemDesignBlock}\n## Completion Checklist`),
    message: "duplicate embedded method ID: persona-team-system-design",
  },
  {
    name: "body tag mismatch",
    source: source.replace('<pi-persona-method-body id="persona-team-system-design">', '<pi-persona-method-body id="persona-team-renamed">'),
    message: "missing embedded method body: persona-team-system-design",
  },
  {
    name: "body hash mismatch",
    source: source.replace(/(<!--\s*pi-persona-method:v1[\s\S]*?"id":\s*"persona-team-system-design"[\s\S]*?"bodySha256":\s*")[a-f0-9]+(")/, `$1${"0".repeat(64)}$2`),
    message: "body hash mismatch for persona-team-system-design",
  },
  {
    name: "missing required method body",
    source: source.replace(/<pi-persona-method-body id="persona-team-system-design">[\s\S]*?<\/pi-persona-method-body>/, ""),
    message: "missing embedded method body: persona-team-system-design",
  },
  {
    name: "unsupported authority",
    source: source.replace('"authority": "planning-read-only"', '"authority": "unsupported"'),
    message: "unsupported authority: unsupported",
  },
  {
    name: "dangling shared method reference",
    source: `${source}\nSee shared methods/persona-team-system-design for the implementation.\n`,
    message: "persona contains a required external/shared method reference",
  },
  {
    name: "empty embedded body",
    source: source
      .replace(/(<!--\s*pi-persona-method:v1[\s\S]*?"id":\s*"persona-team-system-design"[\s\S]*?"bodySha256":\s*")[a-f0-9]+(")/, `$1${emptySha256}$2`)
      .replace(/(<pi-persona-method-body id="persona-team-system-design">)[\s\S]*?(<\/pi-persona-method-body>)/, "$1$2"),
    message: "embedded method body is empty: persona-team-system-design",
  },
];

describe("public persona verifier negative cases", () => {
  for (const item of negativeCases) {
    test(`rejects ${item.name}`, () => {
      const result = verifyPersona(item.source);
      expect(result.status, result.output).not.toBe(0);
      expect(result.output).toContain(item.message);
    });
  }

  test("validates one persona through the command-line verifier", () => {
    const result = verifyPersona(source);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("PASS");
  });
});

test("no-shared-corpus verifier rejects forbidden runtime structures and skillPath", () => {
  const fixture = mkdtempSync(join(tmpdir(), "persona-corpus-"));
  writeFileSync(join(fixture, "package.json"), JSON.stringify({ skillPath: "./methods" }), "utf8");
  for (const directory of ["roles", "methods", "corpus", "generated", "shared-skills"]) mkdirSync(join(fixture, directory));
  mkdirSync(join(fixture, "agents"));
  writeFileSync(join(fixture, "agents", "not-a-persona.txt"), "fixture", "utf8");

  const result = runBun(["scripts/verify-no-shared-corpus.ts", "--root", fixture]);
  const output = `${result.stdout}\n${result.stderr}`;
  expect(result.status).not.toBe(0);
  for (const directory of ["roles", "methods", "corpus", "generated", "shared-skills"]) {
    expect(output).toContain(`forbidden runtime directory exists: ${directory}/`);
  }
  expect(output).toContain("package manifest declares skillPath");
  expect(output).toContain("unexpected non-persona file under agents/: not-a-persona.txt");
});

test("current package passes the no-shared-corpus command", () => {
  const output = execFileSync("bun", ["run", "verify:no-shared-corpus"], { cwd: root, encoding: "utf8" });
  expect(output).toContain("PASS no shared runtime persona/method corpus detected.");
});
