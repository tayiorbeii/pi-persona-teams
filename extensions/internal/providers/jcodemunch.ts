import { ProviderObserver } from "../provider-observer.ts";
import type { ProviderResult } from "./context-mode.ts";

export interface ResolveRepoInput { path: string; }
export interface StructureInput { repo: string; }
export interface CodeSearchInput { repo: string; query: string; filePattern?: string; }
export interface ImpactInput { repo: string; symbol: string; }
export interface RegisterEditInput { path: string; }
export interface JCodeMunchTransport {
  resolveRepository(input: ResolveRepoInput): Promise<unknown>;
  getStructure(input: StructureInput): Promise<unknown>;
  searchCode(input: CodeSearchInput): Promise<unknown>;
  getImpact(input: ImpactInput): Promise<unknown>;
  registerEdit(input: RegisterEditInput): Promise<unknown>;
}

/** External-boundary adapter for structural code retrieval and index refresh. */
export class JCodeMunchProvider {
  readonly name = "jcodemunch" as const;
  constructor(private readonly transport: JCodeMunchTransport | undefined, private readonly observer = new ProviderObserver()) {}
  async detect(): Promise<ProviderResult> { return this.transport ? { status: "available" } : { status: "unavailable", reason: "jCodeMunch tools are not installed or visible" }; }
  async call<T>(operation: keyof JCodeMunchTransport, input: T): Promise<ProviderResult> {
    if (!this.transport) return { status: "unavailable", reason: "jCodeMunch unavailable" };
    try { const value = await this.transport[operation](input as never); return { status: "available", value }; }
    catch (error) { return { status: "failed", reason: error instanceof Error ? error.message : String(error) }; }
  }
}
