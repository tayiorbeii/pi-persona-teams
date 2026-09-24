import { describe, expect, test } from "bun:test";
import { createSingleFlight, loadPiSubagentsPreflight } from "../extensions/internal/persona-facade.ts";

describe("createSingleFlight", () => {
  test("concurrent callers share one in-flight load", async () => {
    let loads = 0;
    const load = createSingleFlight(async () => {
      loads += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { value: loads };
    });
    const [a, b] = await Promise.all([load(), load(), load()]);
    expect(loads).toBe(1);
    expect(a).toBe(b);
  });

  test("a rejected attempt clears the memo so the next call retries fresh", async () => {
    let loads = 0;
    const load = createSingleFlight(async () => {
      loads += 1;
      if (loads === 1) throw new Error("transient loader race");
      return { ok: true };
    });
    expect(load()).rejects.toThrow("transient loader race");
    expect(await load()).toEqual({ ok: true });
    expect(loads).toBe(2);
  });

  test("concurrent retries after a failure share the fresh attempt", async () => {
    let loads = 0;
    const load = createSingleFlight(async () => {
      loads += 1;
      if (loads === 1) throw new Error("first fails");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { attempt: loads };
    });
    await expect(load()).rejects.toThrow("first fails");
    const [a, b] = await Promise.all([load(), load()]);
    expect(loads).toBe(2);
    expect(a).toBe(b);
  });

  test("a settled load is reused without re-invoking the loader", async () => {
    let loads = 0;
    const load = createSingleFlight(async () => ({ n: ++loads }));
    await load();
    await load();
    expect(loads).toBe(1);
  });
});

describe("loadPiSubagentsPreflight", () => {
  test("concurrent first imports resolve to the same fully initialized module", async () => {
    const [a, b] = await Promise.all([loadPiSubagentsPreflight(), loadPiSubagentsPreflight()]);
    expect(a).toBe(b);
    expect(typeof a.resolveSubagentLaunchContract).toBe("function");
    // The namespace must be fully initialized: every export binding reachable.
    const result = (await a.resolveSubagentLaunchContract?.({
      agent: "persona-team.qa-lead",
      cwd: import.meta.dir,
      availableModels: [],
    })) as { ok?: boolean; message?: string } | undefined;
    expect(result).toBeTruthy();
  });
});
