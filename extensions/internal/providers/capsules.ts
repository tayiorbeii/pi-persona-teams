import type { ProviderResult } from "./result.ts";

/** `capsule_recall` arguments: page captured evidence by opaque ref, optionally searching it. */
export interface CapsuleRecallInput {
  ref: string;
  blockIndex?: number;
  offset?: number;
  limit?: number;
  view?: "observation" | "source";
  query?: string;
  caseSensitive?: boolean;
  occurrence?: number;
}

/** `capsule_analyze` arguments: find / outline / aggregate over captured evidence. */
export type CapsuleAnalyzeInput =
  | { op: "find"; ref?: string; refs?: string[]; scope?: "session"; query?: string; queries?: string[]; caseSensitive?: boolean; contextLines?: number; maxMatches?: number; offset?: number }
  | { op: "outline"; ref: string; language?: "auto" | "ts" | "py" | "go" | "rs"; maxSymbols?: number }
  | {
      op: "aggregate";
      ref: string;
      format?: "csv" | "tsv" | "jsonl" | "lines";
      delimiter?: string;
      filter?: Array<{ column: string; cmp: "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "contains"; value: string | number }>;
      groupBy?: string;
      measures: Array<{ fn: "count" | "sum" | "min" | "max" | "mean"; column?: string }>;
    };

/** External-boundary adapter. The Capsules extension supplies the transport in the host runtime. */
export interface CapsulesTransport {
  recall(input: CapsuleRecallInput): Promise<unknown>;
  analyze(input: CapsuleAnalyzeInput): Promise<unknown>;
}

/**
 * Pi Context Capsules captures native read/bash/grep output into a local store. Its model
 * tools only read that captured evidence, so this adapter never runs commands or reads files.
 */
export class CapsulesProvider {
  readonly name = "capsules" as const;
  constructor(private readonly transport: CapsulesTransport | undefined) {}
  async detect(): Promise<ProviderResult> {
    return this.transport ? { status: "available" } : { status: "unavailable", reason: "Capsules tools (capsule_recall, capsule_analyze) are not installed or visible" };
  }
  async recall(input: CapsuleRecallInput): Promise<ProviderResult> {
    return this.call(() => this.transport!.recall(input));
  }
  async analyze(input: CapsuleAnalyzeInput): Promise<ProviderResult> {
    return this.call(() => this.transport!.analyze(input));
  }
  private async call(operation: () => Promise<unknown>): Promise<ProviderResult> {
    if (!this.transport) return { status: "unavailable", reason: "Capsules unavailable" };
    try { return { status: "available", value: await operation() }; }
    catch (error) { return { status: "failed", reason: error instanceof Error ? error.message : String(error) }; }
  }
}
