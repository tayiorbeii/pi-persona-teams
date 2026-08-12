import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaChildRuntime } from "../extensions/persona-child.ts";
import { detectProviders } from "../extensions/internal/provider-observer.ts";

const root = join(import.meta.dir, "..");
const personaPath = join(root, "agents", "engineering-manager.md");

function admittedChild(
  workspace: string,
  providerInput: { toolNames?: string[]; tools?: Array<{ name?: string; description?: string; source?: string; provenance?: string }> } = {
    toolNames: ["jcodemunch_get_symbol_source"],
  },
): PersonaChildRuntime {
  const child = new PersonaChildRuntime({
    identity: { runtimeName: "persona-team.engineering-manager", runId: "provider-adversarial", childIndex: 0 },
    personaPath,
    workspace,
    attestationDir: join(workspace, "attestations"),
    ...providerInput,
  });
  const status = child.handle({ action: "status" });
  for (const method of status.status?.requiredMethods ?? []) {
    expect(child.handle({ action: "activate", method: method.id, plannedApplication: `Apply ${method.id} to the provider routing regression.` }).ok).toBe(true);
  }
  return child;
}

describe("host-observed provider routing", () => {
  test("only exact provider tool identities establish availability", () => {
    const spoofed = detectProviders({
      toolNames: ["fake_jcodemunch_search_symbols", "ctx_search_backup"],
      tools: [{ name: "ordinary_tool", description: "jCodeMunch context provider", source: "context-mode" }],
      environment: {},
    });
    expect(spoofed.jcodemunch.availability).toBe("unavailable");
    expect(spoofed.contextMode.availability).toBe("unavailable");

    const evilDescriptors = detectProviders({
      tools: [
        { name: "ctx_search", source: "evil-extension" },
        { name: "jcodemunch_get_symbol_source", provenance: "evil-extension" },
      ],
      environment: {},
    });
    expect(evilDescriptors.contextMode.availability).toBe("unavailable");
    expect(evilDescriptors.jcodemunch.availability).toBe("unavailable");

    const trustedDescriptors = detectProviders({
      tools: [
        { name: "ctx_search", source: "context-mode" },
        { name: "jcodemunch_get_symbol_source", provenance: "jcodemunch" },
      ],
      environment: {},
    });
    expect(trustedDescriptors.contextMode.availability).toBe("available");
    expect(trustedDescriptors.jcodemunch.availability).toBe("available");

    const observed = detectProviders({ toolNames: ["jcodemunch_get_symbol_source", "ctx_search"], environment: {} });
    expect(observed.jcodemunch.availability).toBe("available");
    expect(observed.contextMode.availability).toBe("available");
  });

  test("evil-extension descriptors cannot gain provider boundary authority", () => {
    const workspace = mkdtempSync(join(tmpdir(), "persona-provider-evil-descriptor-"));
    try {
      const child = admittedChild(workspace, {
        tools: [
          { name: "ctx_search", source: "evil-extension" },
          { name: "jcodemunch_get_symbol_source", provenance: "evil-extension" },
        ],
      });

      expect(child.toolCall("ctx_search", { query: "bounded" })).toMatchObject({
        allowed: true,
        reason: "approved read-only provider operation",
      });
      expect(child.toolCall("jcodemunch_get_symbol_source", { symbol_id: "src/example.ts::example#function" })).toMatchObject({
        allowed: true,
        reason: "approved read-only provider operation",
      });
      expect(child.toolCall("ctx_execute", { code: "malicious()" })).toMatchObject({ allowed: false });
      expect(child.handle({ action: "status" }).status?.providers).toMatchObject({
        contextMode: { availability: "unavailable", uses: 0 },
        jcodemunch: { availability: "unavailable", uses: 0 },
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("redirect and unattempted retry cannot bypass provider routing", () => {
    const workspace = mkdtempSync(join(tmpdir(), "persona-provider-unattempted-"));
    try {
      const child = admittedChild(workspace);
      const input = { path: join(workspace, "src", "unattempted.ts") };
      expect(child.toolCall("read", input)).toMatchObject({ allowed: false });
      const retry = child.toolCall("read", input);
      expect(retry).toMatchObject({ allowed: false });
      expect(retry.reason).toContain("correlated jCodeMunch failure");
      expect(child.handle({ action: "status" }).status?.providers.native).toMatchObject({ uses: 0, fallbackUses: 0 });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("provider success is counted once and does not grant native fallback", () => {
    const workspace = mkdtempSync(join(tmpdir(), "persona-provider-success-"));
    try {
      const child = admittedChild(workspace);
      const nativeInput = { path: join(workspace, "src", "success.ts") };
      const providerInput = { symbol_id: "src/success.ts::success#function" };
      expect(child.toolCall("read", nativeInput).allowed).toBe(false);
      expect(child.toolCall("jcodemunch_get_symbol_source", providerInput, "provider-success").allowed).toBe(true);
      child.providerResult("jcodemunch_get_symbol_source", providerInput, false, undefined, "provider-success");
      child.providerResult("jcodemunch_get_symbol_source", providerInput, false, undefined, "provider-success");

      expect(child.toolCall("read", nativeInput)).toMatchObject({ allowed: false });
      expect(child.handle({ action: "status" }).status?.providers.jcodemunch).toMatchObject({
        availability: "available",
        status: "used",
        uses: 1,
        failures: 0,
        fallbackUses: 0,
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("one correlated provider failure grants exactly one native fallback", () => {
    const workspace = mkdtempSync(join(tmpdir(), "persona-provider-failure-"));
    try {
      const child = admittedChild(workspace);
      const nativeInput = { path: join(workspace, "src", "failure.ts") };
      const providerInput = { symbol_id: "src/failure.ts::failure#function" };
      expect(child.toolCall("read", nativeInput).allowed).toBe(false);
      expect(child.toolCall("jcodemunch_get_symbol_source", providerInput, "provider-failure").allowed).toBe(true);
      child.providerResult("jcodemunch_get_symbol_source", providerInput, true, "provider unavailable", "provider-failure");
      child.providerResult("jcodemunch_get_symbol_source", providerInput, true, "duplicate result", "provider-failure");

      expect(child.toolCall("read", nativeInput).allowed).toBe(true);
      expect(child.toolCall("read", nativeInput)).toMatchObject({ allowed: false });
      const providers = child.handle({ action: "status" }).status?.providers;
      expect(providers?.jcodemunch).toMatchObject({ status: "degraded", uses: 1, failures: 1, fallbackUses: 1 });
      expect(providers?.native).toMatchObject({ status: "used", uses: 1, fallbackUses: 1 });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("self-reported provider state and unobserved results cannot spoof counters", () => {
    const workspace = mkdtempSync(join(tmpdir(), "persona-provider-spoof-"));
    try {
      const child = admittedChild(workspace);
      const spoof = child.handle({ action: "provider", provider: "jcodemunch", availability: "available", status: "used", reason: "child claims provider use" });
      expect(spoof.ok).toBe(false);
      expect(spoof.message).toContain("host-observed");
      child.providerResult("jcodemunch_get_symbol_source", { symbol_id: "unobserved" }, true, "spoofed failure");
      expect(child.handle({ action: "status" }).status?.providers.jcodemunch).toMatchObject({
        status: "not_applicable",
        uses: 0,
        failures: 0,
        fallbackUses: 0,
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
