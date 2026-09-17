import { expect, test } from "bun:test";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { readAttestation } from "../extensions/internal/attestation.ts";
import { runPersona } from "../extensions/internal/persona-facade.ts";
import { sha256 } from "../extensions/internal/persona-file.ts";

const root = join(import.meta.dir, "..");
const personaPath = join(root, "agents", "engineering-manager.md");
const methods = [
  "persona-team-domain-driven-design",
  "persona-team-system-design",
  "persona-team-ddia-systems",
  "persona-team-clean-architecture",
];

function completeChild(attestationDir: string): { runId: string; childIndex: number; attestationPath: string; launchContractDigest: string } {
  const runId = "e2e-engineering-manager";
  const childIndex = 3;
  const launchContractDigest = sha256(JSON.stringify({
    agent: "persona-team.engineering-manager",
    task: "Produce a bounded engineering plan.",
    context: "fresh",
    cwd: root,
    childExtension: join(root, "extensions", "persona-child.ts"),
  }));
  const identity = { runtimeName: "persona-team.engineering-manager", runId, childIndex, launchContractDigest };
  const child = new PersonaChildRuntime({
    identity,
    personaPath,
    workspace: root,
    attestationDir,
  });
  expect(child.handle({ action: "status" }).ok).toBe(true);
  for (const method of methods) {
    expect(child.handle({
      action: "activate",
      method,
      plannedApplication: `Apply ${method} to the bounded planning task and record its concrete trade-offs.`,
    }).ok).toBe(true);
    expect(child.handle({
      action: "disposition",
      method,
      disposition: "applied",
      evidence: [{ kind: "artifact-section", path: "docs/plans/engineering.md", locator: method, summary: `The engineering plan records evidence from ${method}.` }],
    }).ok).toBe(true);
  }
  const completed = child.handle({ action: "complete", outputSummary: "Produced the bounded Engineering Manager plan." });
  if (!completed.ok || !completed.attestationPath || !completed.attestation?.launchContractDigest) throw new Error(completed.message);
  return { runId, childIndex, attestationPath: completed.attestationPath, launchContractDigest: completed.attestation.launchContractDigest };
}

test("parent accepts a persisted host attestation and rejects reused run identity", async () => {
  const attestationDir = mkdtempSync(join(tmpdir(), "persona-e2e-attestation-"));
  const attemptStartedAt = Date.now();
  const childRun = completeChild(attestationDir);
  const persisted = JSON.parse(readFileSync(childRun.attestationPath, "utf8")) as { schema: string; status: string; runId: string; childIndex: number; launchContractDigest: string };
  expect(persisted.schema).toBe("pi.persona-attestation/v1");
  expect(persisted.status).toBe("passed");
  expect(persisted.runId).toBe(childRun.runId);
  expect(persisted.childIndex).toBe(childRun.childIndex);

  const accepted = await runPersona({
    packageRoot: root,
    workspace: root,
    attemptStartedAt,
    delegate: async () => ({ ...childRun, output: "Plan artifact produced.", launchContractDigest: persisted.launchContractDigest, ordinaryAccepted: true }),
  }, "persona-team.engineering-manager", "Produce a bounded engineering plan.");
  expect(accepted.accepted, accepted.errors.join("; ")).toBe(true);
  expect(accepted.personaAccepted).toBe(true);
  expect(accepted.ordinaryAccepted).toBe(true);

  for (const verificationPolicy of ["advisory", "strict"] as const) {
    const warned = await runPersona({
      packageRoot: root,
      workspace: root,
      attemptStartedAt,
      verificationPolicy,
      delegate: async () => ({ ...childRun, output: "Useful but not launch-verified", ordinaryAccepted: true, warnings: ["preflight digest mismatch"] }),
    }, "persona-team.engineering-manager", "Produce a bounded engineering plan.");
    expect(warned.accepted).toBe(false);
    expect(warned.output).toBe("Useful but not launch-verified");
    expect(verificationPolicy === "advisory" ? warned.warnings : warned.errors).toContain("preflight digest mismatch");
  }

  const reused = await runPersona({
    packageRoot: root,
    workspace: root,
    verificationPolicy: "strict",
    independentFrom: { runtimeName: "persona-team.engineering-manager", runId: childRun.runId },
    delegate: async () => ({ ...childRun, launchContractDigest: persisted.launchContractDigest, ordinaryAccepted: true }),
  }, "persona-team.engineering-manager", "Produce a second independent engineering plan.");
  expect(reused.accepted).toBe(false);
  expect(reused.errors).toContain("independent run identity matches the earlier run");
});

test("rejects a stale persisted attestation when run identity and child index are reused", async () => {
  const attestationDir = mkdtempSync(join(tmpdir(), "persona-stale-attestation-"));
  const childRun = completeChild(attestationDir);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const attemptStartedAt = Date.now();

  const reused = await runPersona({
    packageRoot: root,
    workspace: root,
    attestationDir,
    attemptStartedAt,
    delegate: async () => ({ ...childRun, attestationPath: childRun.attestationPath, ordinaryAccepted: true }),
  }, "persona-team.engineering-manager", "Produce a second engineering plan.");

  expect(reused.accepted).toBe(false);
  expect(reused.errors).toContain("attestation issuedAt predates the current delegation attempt");
  expect(reused.errors).toContain("attestation file mtime predates the current delegation attempt");
});

test("failure attestation persists across lifecycle shutdown and is rejected by the parent", async () => {
  const attestationDir = mkdtempSync(join(tmpdir(), "persona-failure-attestation-"));
  const launchContractDigest = sha256(JSON.stringify({
    agent: "persona-team.engineering-manager",
    task: "Recover the failed lifecycle run.",
    context: "fresh",
    cwd: root,
    childExtension: join(root, "extensions", "persona-child.ts"),
  }));
  const identity = { runtimeName: "persona-team.engineering-manager", runId: "failed-lifecycle", childIndex: 4, launchContractDigest };
  const child = new PersonaChildRuntime({
    identity,
    personaPath,
    workspace: root,
    attestationDir,
  });
  const persisted = child.persistFailureAttestation();
  const reloaded = readAttestation(persisted.path);
  expect(reloaded.schema).toBe("pi.persona-attestation/v1");
  expect(reloaded.status).toBe("failed");
  expect(reloaded.failureReasons).toContain("ledger completion did not pass");

  const accepted = await runPersona({
    packageRoot: root,
    workspace: root,
    verificationPolicy: "strict",
    delegate: async () => ({ runId: "failed-lifecycle", childIndex: 4, attestationPath: persisted.path, launchContractDigest: reloaded.launchContractDigest, ordinaryAccepted: true }),
  }, "persona-team.engineering-manager", "Recover the failed lifecycle run.");
  expect(accepted.accepted).toBe(false);
  expect(accepted.personaAccepted).toBe(false);
  expect(accepted.errors).toContain("attestation status is not passed");
});
