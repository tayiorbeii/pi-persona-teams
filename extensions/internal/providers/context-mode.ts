import { ProviderObserver } from "../provider-observer.ts";

export interface ContextSearchInput { query: string; source?: string; limit?: number; }
export interface LargeOutputInput { command: string; intent?: string; }
export interface ProviderResult<T = unknown> { status: "available" | "unavailable" | "failed"; value?: T; reason?: string; }

/** External-boundary adapter. Transport is supplied by the host runtime. */
export interface ContextModeTransport {
  searchContent(input: ContextSearchInput): Promise<unknown>;
  processLargeOutput(input: LargeOutputInput): Promise<unknown>;
}

export class ContextModeProvider {
  readonly name = "contextMode" as const;
  constructor(private readonly transport: ContextModeTransport | undefined, private readonly observer = new ProviderObserver()) {}
  async detect(): Promise<ProviderResult> {
    return this.transport ? { status: "available" } : { status: "unavailable", reason: "context-mode tools are not installed or visible" };
  }
  async searchContent(input: ContextSearchInput): Promise<ProviderResult> {
    if (!this.transport) return { status: "unavailable", reason: "context-mode unavailable" };
    try { const value = await this.transport.searchContent(input); return { status: "available", value }; }
    catch (error) { return { status: "failed", reason: error instanceof Error ? error.message : String(error) }; }
  }
  async processLargeOutput(input: LargeOutputInput): Promise<ProviderResult> {
    if (!this.transport) return { status: "unavailable", reason: "context-mode unavailable" };
    try { const value = await this.transport.processLargeOutput(input); return { status: "available", value }; }
    catch (error) { return { status: "failed", reason: error instanceof Error ? error.message : String(error) }; }
  }
}
