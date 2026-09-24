import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import parentExtension from "../extensions/persona-parent.ts";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { registerPromptTemplateDelegationBridge } from "../node_modules/pi-subagents/src/slash/prompt-template-bridge.ts";
import { resolveSubagentLaunchContract } from "pi-subagents/preflight";

const root = join(import.meta.dir, "..");
const persona = "persona-team.engineering-manager";
const task = "Produce a bounded engineering plan.";
const methods = [
  "persona-team-domain-driven-design",
  "persona-team-system-design",
  "persona-team-ddia-systems",
  "persona-team-clean-architecture",
];

class TestEvents {
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void): () => void {
    const handlers = this.listeners.get(event) ?? new Set<(payload: unknown) => void>();
    handlers.add(handler);
    this.listeners.set(event, handlers);
    return () => handlers.delete(handler);
  }

  emit(event: string, payload: unknown): void {
    for (const handler of [...(this.listeners.get(event) ?? [])]) handler(payload);
  }
}

test("persona_team accepts a real-shaped child through the installed pi-subagents event bridge", async () => {
  const attestationDir = mkdtempSync(join(tmpdir(), "persona-real-delegation-"));
  const previousAttestationDir = process.env.PI_PERSONA_ATTESTATION_DIR;
  process.env.PI_PERSONA_ATTESTATION_DIR = attestationDir;
  const events = new TestEvents();
  const tools: Array<{ execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{ details: Record<string, unknown> }> }> = [];
  const pi = {
    events,
    modelRegistry: { getAvailable: () => [] },
    getAllTools: () => [],
    registerTool(tool: typeof tools[number]) {
      tools.push(tool);
    },
  };
  parentExtension(pi);

  const bridge = registerPromptTemplateDelegationBridge({
    events,
    getContext: () => ({ cwd: root }),
    execute: async () => { throw new Error("legacy delegation path should not be used"); },
    executeStructured: async (_requestId, params) => {
      const launch = await resolveSubagentLaunchContract({
        agent: params.agent,
        task: params.task,
        context: params.context,
        cwd: params.cwd,
        availableModels: [],
      });
      if (!launch.ok) throw new Error(launch.message);

      const child = new PersonaChildRuntime({
        identity: { runtimeName: params.agent!, runId: "installed-event-run", childIndex: 0 },
        personaPath: join(root, "agents", "engineering-manager.md"),
        workspace: root,
        attestationDir,
      });
      expect(child.handle({ action: "status" }).ok).toBe(true);
      for (const method of methods) {
        expect(child.handle({ action: "activate", method, plannedApplication: `Apply ${method} to the bounded plan.` }).ok).toBe(true);
        expect(child.handle({
          action: "disposition",
          method,
          disposition: "applied",
          evidence: [{ kind: "artifact-section", path: "docs/plans/engineering.md", summary: `Evidence from ${method}.` }],
        }).ok).toBe(true);
      }
      const completed = child.handle({ action: "complete", outputSummary: "Produced the bounded plan." });
      if (!completed.ok || !completed.attestationPath || !completed.attestation) throw new Error(completed.message);
      // pi-subagents 0.60.0 exposes the parent launch digest in the response
      // details, while this real child environment has no digest field.
      if (completed.attestation.launchContractDigest !== undefined) throw new Error("child unexpectedly received a launch digest");

      return {
        content: [],
        details: {
          mode: "single",
          runId: "installed-event-run",
          results: [{
            agent: params.agent,
            finalOutput: "Produced the bounded plan.",
            launchContractDigest: launch.contract.launchContractDigest,
          }],
        },
      } as never;
    },
  });

  try {
    expect(tools).toHaveLength(1);
    const result = await tools[0]!.execute("real-event-call", { action: "run", persona, task });
    expect(result.details.accepted).toBe(true);
    expect(result.details.ordinaryAccepted).toBe(true);
    expect(result.details.personaAccepted).toBe(true);
    expect(result.details.launchContractDigest).toBeString();
    expect((result.details.attestation as { launchContractDigest?: string }).launchContractDigest).toBeUndefined();
  } finally {
    bridge.dispose();
    if (previousAttestationDir === undefined) delete process.env.PI_PERSONA_ATTESTATION_DIR;
    else process.env.PI_PERSONA_ATTESTATION_DIR = previousAttestationDir;
  }
});
