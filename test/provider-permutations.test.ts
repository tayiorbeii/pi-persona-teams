import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { CAPSULES_CONTEXT_OWNER_CONFLICT, detectProviders, isContextModeToolName, ProviderObserver } from "../extensions/internal/provider-observer.ts";

const root = join(import.meta.dir, "..");
const personaPath = join(root, "agents", "engineering-manager.md");

describe("deterministic provider permutations", () => {
  const permutations = [
    { name: "neither", toolNames: [], context: "unavailable", code: "unavailable" },
    { name: "Capsules recall only", toolNames: ["capsule_recall"], context: "available", code: "unavailable" },
    { name: "Capsules analyze only", toolNames: ["capsule_analyze"], context: "available", code: "unavailable" },
    { name: "context-mode is no longer a provider", toolNames: ["ctx_search"], context: "unavailable", code: "unavailable" },
    { name: "jCodeMunch only", toolNames: ["jcodemunch_search_symbols"], context: "unavailable", code: "available" },
    { name: "both", toolNames: ["capsule_recall", "capsule_analyze", "jcodemunch_search_symbols"], context: "available", code: "available" },
  ] as const;

  for (const permutation of permutations) {
    test(`${permutation.name} provider availability is deterministic`, () => {
      const providers = detectProviders({ toolNames: permutation.toolNames, environment: {} });
      expect(providers.capsules.availability).toBe(permutation.context);
      expect(providers.jcodemunch.availability).toBe(permutation.code);
      expect(providers.capsules.status).toBe(permutation.context === "available" ? "not_applicable" : "unavailable");
      expect(providers.jcodemunch.status).toBe(permutation.code === "available" ? "not_applicable" : "unavailable");
    });
  }

  test("irrelevant available providers record specific non-use", () => {
    const observer = new ProviderObserver({ toolNames: ["capsule_recall", "jcodemunch_search_symbols"] });
    observer.markNotApplicable("capsules", "task did not require context retrieval");
    observer.markNotApplicable("jcodemunch", "task did not require code exploration");
    expect(observer.observations.capsules).toMatchObject({ availability: "available", status: "not_applicable", reason: "task did not require context retrieval" });
    expect(observer.observations.jcodemunch).toMatchObject({ availability: "available", status: "not_applicable", reason: "task did not require code exploration" });
  });

  test("the Capsules environment flag establishes availability like the jCodeMunch flag", () => {
    const providers = detectProviders({ toolNames: [], environment: { PI_CAPSULES_AVAILABLE: "1", PI_CONTEXT_MODE_AVAILABLE: "1" } });
    expect(providers.capsules).toMatchObject({ availability: "available", status: "not_applicable" });
    expect(providers).not.toHaveProperty("contextMode");
    expect(detectProviders({ toolNames: [], environment: { PI_CAPSULES_AVAILABLE: "0" } }).capsules.availability).toBe("unavailable");
  });

  test("context-mode tools beside Capsules report the Capsules context-owner conflict", () => {
    for (const contextTool of ["ctx_execute", "context-mode_ctx_search", "mcp__context-mode__ctx_batch_execute", "context_mode_ctx_index"]) {
      expect(isContextModeToolName(contextTool), contextTool).toBe(true);
      const providers = detectProviders({ toolNames: ["capsule_recall", "capsule_analyze", contextTool], environment: {} });
      expect(providers.capsules, contextTool).toMatchObject({ availability: "failed", status: "degraded", reason: CAPSULES_CONTEXT_OWNER_CONFLICT });
    }
    for (const unrelated of ["capsule_recall", "ctx_search_backup", "jcodemunch_search_symbols", "read"]) expect(isContextModeToolName(unrelated), unrelated).toBe(false);
    // Without Capsules there is nothing to conflict with.
    expect(detectProviders({ toolNames: ["ctx_search"], environment: {} }).capsules.availability).toBe("unavailable");

    const observer = new ProviderObserver({ toolNames: ["capsule_recall"] });
    expect(observer.availability("capsules")).toBe("available");
    observer.reprobe(["capsule_recall", "ctx_execute"]);
    expect(observer.observations.capsules).toMatchObject({ availability: "failed", status: "degraded", reason: CAPSULES_CONTEXT_OWNER_CONFLICT });
  });

  test("Capsules tool failures are recorded as degraded provider evidence", () => {
    const observer = new ProviderObserver({ toolNames: ["capsule_recall"] });
    expect(observer.observeToolCall("capsule_recall", "recall:1", "call-1")).toBe("capsules");
    observer.observeToolResult("capsule_recall", "recall:1", true, "Capsules unavailable: context-owner-conflict.", "call-1");
    expect(observer.observations.capsules).toMatchObject({ availability: "failed", status: "degraded", uses: 1, failures: 1, reason: "Capsules unavailable: context-owner-conflict." });
  });

  test("provider failure grants one fallback and prevents a routing loop", () => {
    const observer = new ProviderObserver({ toolNames: ["jcodemunch_search_symbols"] });
    const fingerprint = "code-orientation";
    expect(observer.shouldRedirect("jcodemunch", fingerprint)).toBe(true);
    expect(observer.shouldRedirect("jcodemunch", fingerprint)).toBe(false);

    observer.failed("jcodemunch", fingerprint, "provider call failed");
    expect(observer.observations.jcodemunch).toMatchObject({ availability: "failed", status: "degraded", failures: 1, reason: "provider call failed" });
    expect(observer.shouldRedirect("jcodemunch", fingerprint)).toBe(false);
    expect(observer.allowFallback("jcodemunch", fingerprint)).toBe(true);
    expect(observer.allowFallback("jcodemunch", fingerprint)).toBe(false);
    expect(observer.observations.jcodemunch.fallbackUses).toBe(1);
  });

  test("child status exposes provider availability and use", () => {
    const workspace = mkdtempSync(join(tmpdir(), "persona-provider-status-"));
    try {
      const child = new PersonaChildRuntime({
        identity: { runtimeName: "persona-team.engineering-manager", runId: "provider-status", childIndex: 0 },
        personaPath,
        workspace,
        attestationDir: join(workspace, "attestations"),
        toolNames: ["capsule_recall", "capsule_analyze", "jcodemunch_search_symbols"],
      });
      const initial = child.handle({ action: "status" });
      expect(initial.status?.providers).not.toHaveProperty("contextMode");
      expect(initial.status?.providers.capsules).toMatchObject({ availability: "available", status: "not_applicable", uses: 0 });
      expect(initial.status?.providers.jcodemunch).toMatchObject({ availability: "available", status: "not_applicable", uses: 0 });
      for (const method of initial.status?.requiredMethods ?? []) {
        expect(child.handle({ action: "activate", method: method.id, plannedApplication: `Apply ${method.id} to the provider status task.` }).ok).toBe(true);
      }
      expect(child.toolCall("capsule_recall", { ref: "nev1_example", query: "bounded context" }).allowed).toBe(true);
      expect(child.toolCall("capsule_analyze", { ref: "nev1_example", op: "find", queries: ["bounded"] }).allowed).toBe(true);
      expect(child.toolCall("jcodemunch_search_symbols", { query: "bounded symbol" }).allowed).toBe(true);
      const afterUse = child.handle({ action: "status" });
      expect(afterUse.status?.providers.capsules).toMatchObject({ status: "used", uses: 2 });
      expect(afterUse.status?.providers.jcodemunch).toMatchObject({ status: "used", uses: 1 });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
