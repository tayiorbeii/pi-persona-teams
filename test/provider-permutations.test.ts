import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { detectProviders, ProviderObserver } from "../extensions/internal/provider-observer.ts";

const root = join(import.meta.dir, "..");
const personaPath = join(root, "agents", "engineering-manager.md");

describe("deterministic provider permutations", () => {
  const permutations = [
    { name: "neither", toolNames: [], context: "unavailable", code: "unavailable" },
    { name: "context-mode only", toolNames: ["ctx_search"], context: "available", code: "unavailable" },
    { name: "jCodeMunch only", toolNames: ["jcodemunch_search_symbols"], context: "unavailable", code: "available" },
    { name: "both", toolNames: ["ctx_search", "jcodemunch_search_symbols"], context: "available", code: "available" },
  ] as const;

  for (const permutation of permutations) {
    test(`${permutation.name} provider availability is deterministic`, () => {
      const providers = detectProviders({ toolNames: permutation.toolNames, environment: {} });
      expect(providers.contextMode.availability).toBe(permutation.context);
      expect(providers.jcodemunch.availability).toBe(permutation.code);
      expect(providers.contextMode.status).toBe(permutation.context === "available" ? "not_applicable" : "unavailable");
      expect(providers.jcodemunch.status).toBe(permutation.code === "available" ? "not_applicable" : "unavailable");
    });
  }

  test("irrelevant available providers record specific non-use", () => {
    const observer = new ProviderObserver({ toolNames: ["ctx_search", "jcodemunch_search_symbols"] });
    observer.markNotApplicable("contextMode", "task did not require context retrieval");
    observer.markNotApplicable("jcodemunch", "task did not require code exploration");
    expect(observer.observations.contextMode).toMatchObject({ availability: "available", status: "not_applicable", reason: "task did not require context retrieval" });
    expect(observer.observations.jcodemunch).toMatchObject({ availability: "available", status: "not_applicable", reason: "task did not require code exploration" });
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
        toolNames: ["ctx_search", "jcodemunch_search_symbols"],
      });
      const initial = child.handle({ action: "status" });
      expect(initial.status?.providers.contextMode).toMatchObject({ availability: "available", status: "not_applicable", uses: 0 });
      expect(initial.status?.providers.jcodemunch).toMatchObject({ availability: "available", status: "not_applicable", uses: 0 });
      for (const method of initial.status?.requiredMethods ?? []) {
        expect(child.handle({ action: "activate", method: method.id, plannedApplication: `Apply ${method.id} to the provider status task.` }).ok).toBe(true);
      }
      expect(child.toolCall("context-mode.search", { query: "bounded context" }).allowed).toBe(true);
      expect(child.toolCall("jcodemunch_search_symbols", { query: "bounded symbol" }).allowed).toBe(true);
      const afterUse = child.handle({ action: "status" });
      expect(afterUse.status?.providers.contextMode).toMatchObject({ status: "used", uses: 1 });
      expect(afterUse.status?.providers.jcodemunch).toMatchObject({ status: "used", uses: 1 });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
