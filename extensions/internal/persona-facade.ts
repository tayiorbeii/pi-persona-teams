import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { resolvePersonaPath, validatePersonaFile, type PersonaFile } from "./persona-file.ts";
import { verifyAttestation, readAttestation, type PersonaAttestation } from "./attestation.ts";
import { providerDoctor, type ProviderObservation, type ProviderToolDescriptor } from "./provider-observer.ts";

export interface PersonaSummary {
  runtimeName: string;
  role: string;
  description: string;
  authority: string;
  requiredMethodCount: number;
  valid: boolean;
  source: "package" | "project" | "unknown";
}

export interface PersonaDiscovery {
  runtimeName: string;
  source: string;
  filePath?: string;
  packageName?: string;
}

export interface DelegationRequest {
  agent: string;
  task: string;
  context: "fresh";
  acceptance?: unknown;
}

export interface DelegationResult {
  output?: string;
  runId: string;
  childIndex?: number;
  launchContractDigest?: string;
  attestation?: PersonaAttestation;
  attestationPath?: string;
  ordinaryAccepted?: boolean;
  ordinaryAcceptanceReason?: string;
}

export interface PersonaRunResult {
  accepted: boolean;
  output?: string;
  runtimeName: string;
  attestation?: PersonaAttestation;
  errors: string[];
  ordinaryAccepted: boolean;
  personaAccepted: boolean;
  delegated: boolean;
}

export interface PersonaFacadeOptions {
  packageRoot: string;
  workspace?: string;
  discover?: (cwd: string) => Promise<PersonaDiscovery[]> | PersonaDiscovery[];
  delegate?: (request: DelegationRequest) => Promise<DelegationResult>;
  toolNames?: string[];
  environment?: Record<string, string | undefined>;
  toolDescriptors?: ProviderToolDescriptor[];
  attestationDir?: string;
  independentFrom?: { runtimeName: string; runId: string };
}

function descriptionFromFrontmatter(source: string): string {
  const match = source.match(/^description:\s*(.+)$/m);
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

export function personaFiles(packageRoot: string): string[] {
  const directory = join(packageRoot, "agents");
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name: string) => name.endsWith(".md")).sort().map((name: string) => join(directory, name));
}

export function listPersonas(packageRoot: string): PersonaSummary[] {
  return personaFiles(packageRoot).map((filePath) => {
    const result = validatePersonaFile(filePath);
    const role = result.persona?.contract.role ?? basename(filePath, ".md");
    return {
      runtimeName: result.runtimeName ?? `persona-team.${role}`,
      role,
      description: result.persona ? descriptionFromFrontmatter(result.persona.source) : "invalid persona file",
      authority: result.persona?.contract.authority ?? "unknown",
      requiredMethodCount: result.requiredMethodCount ?? 0,
      valid: result.valid,
      source: "package",
    };
  });
}

export async function discoverThroughPiSubagents(cwd: string): Promise<PersonaDiscovery[]> {
  try {
    const moduleName: string = "pi-subagents/preflight";
    const runtime = await import(moduleName) as {
      resolveSubagentLaunchContract?: (input: Record<string, unknown>) => Promise<any>;
    };
    if (!runtime.resolveSubagentLaunchContract) return [];
    const result = await runtime.resolveSubagentLaunchContract({ agent: "persona-team.engineering-manager", task: "persona discovery preflight", context: "fresh", cwd, availableModels: [] });
    if (!result.ok || !result.contract?.agent) return [];
    const selected = result.contract.agent;
    return [selected, ...(selected.shadowedCandidates ?? [])].map((agent: { name: string; source: string; filePath: string; packageName?: string }) => ({ runtimeName: agent.name, source: agent.source, filePath: agent.filePath, packageName: agent.packageName }));
  } catch {
    return [];
  }
}

export async function personaDoctor(options: PersonaFacadeOptions): Promise<{
  ready: boolean;
  baselineReady: boolean;
  personas: PersonaSummary[];
  discoveries: PersonaDiscovery[];
  providers: { contextMode: ProviderObservation; jcodemunch: ProviderObservation };
  childExtension: { present: boolean; path: string };
  deficiencies: string[];
  degraded: string[];
}> {
  const workspace = options.workspace ?? process.cwd();
  const personas = listPersonas(options.packageRoot);
  const discoveries = options.discover ? await options.discover(workspace) : await discoverThroughPiSubagents(workspace);
  const deficiencies: string[] = [];
  const degraded: string[] = [];
  if (personas.length !== 10) deficiencies.push(`expected ten canonical persona files, found ${personas.length}`);
  for (const persona of personas) if (!persona.valid) deficiencies.push(`${persona.runtimeName} is invalid`);
  const packageNames = new Set(discoveries.filter((item) => item.source === "package" || item.packageName === "persona-team").map((item) => item.runtimeName));
  if (discoveries.length === 0 && !options.discover) deficiencies.push("pi-subagents discovery API is unavailable");
  if (discoveries.length > 0 && !packageNames.has("persona-team.engineering-manager")) deficiencies.push("Engineering Manager is not discoverable through pi-subagents");
  const collisions = discoveries.filter((item) => item.runtimeName === "persona-team.engineering-manager" && item.source !== "package");
  if (collisions.length) deficiencies.push("Engineering Manager has a non-package shadow or collision");
  const childPath = join(options.packageRoot, "extensions", "persona-child.ts");
  if (!existsSync(childPath)) deficiencies.push("child enforcement extension is missing");
  const providers = providerDoctor(options.toolNames ?? [], options.environment, options.toolDescriptors);
  if (providers.contextMode.availability === "unavailable") degraded.push("context-mode unavailable; bounded native fallback is active");
  if (providers.jcodemunch.availability === "unavailable") degraded.push("jCodeMunch unavailable; bounded native fallback is active");
  return {
    ready: deficiencies.length === 0,
    baselineReady: deficiencies.length === 0,
    personas,
    discoveries,
    providers,
    childExtension: { present: existsSync(childPath), path: childPath },
    deficiencies,
    degraded,
  };
}

function selectedPersona(options: PersonaFacadeOptions, runtimeName: string): { result: ReturnType<typeof validatePersonaFile>; persona?: PersonaFile } {
  const prefix = "persona-team.";
  if (!runtimeName.startsWith(prefix)) return { result: { valid: false, path: runtimeName, errors: ["unknown persona runtime name"], warnings: [] } };
  try {
    const filePath = resolvePersonaPath(options.packageRoot, runtimeName);
    const result = validatePersonaFile(filePath);
    return { result, persona: result.persona };
  } catch (error) {
    return { result: { valid: false, path: runtimeName, errors: [error instanceof Error ? error.message : String(error)], warnings: [] } };
  }
}

function findAttestation(options: PersonaFacadeOptions, runtimeName: string, runId: string): { attestation: PersonaAttestation; path: string } | undefined {
  const directory = options.attestationDir ?? join(options.workspace ?? process.cwd(), ".pi-persona", "attestations");
  if (!existsSync(directory)) return undefined;
  const safeRunId = runId.replace(/[^A-Za-z0-9._-]/g, "_");
  for (const name of readdirSync(directory, { encoding: "utf8" }).filter((item: string) => item.startsWith(`${safeRunId}-`) && item.endsWith(".json")).sort().reverse()) {
    try {
      const path = join(directory, name);
      const attestation = readAttestation(path);
      if (attestation.runtimeName === runtimeName && attestation.runId === runId) return { attestation, path };
    } catch {
      // Ignore unrelated or partially written artifacts and keep searching.
    }
  }
  return undefined;
}

export async function runPersona(options: PersonaFacadeOptions, runtimeName: string, task: string): Promise<PersonaRunResult> {
  const selected = selectedPersona(options, runtimeName);
  if (!selected.result.valid || !selected.persona) {
    return { accepted: false, runtimeName, errors: selected.result.errors, ordinaryAccepted: false, personaAccepted: false, delegated: false };
  }
  if (!options.delegate) {
    return { accepted: false, runtimeName, errors: ["persona facade requires the supported pi-subagents delegation seam; no custom launcher is available"], ordinaryAccepted: false, personaAccepted: false, delegated: false };
  }
  let delegated: DelegationResult;
  try {
    delegated = await options.delegate({ agent: runtimeName, task, context: "fresh" });
  } catch (error) {
    return { accepted: false, runtimeName, errors: [`pi-subagents delegation failed: ${error instanceof Error ? error.message : String(error)}`], ordinaryAccepted: false, personaAccepted: false, delegated: true };
  }
  let attestation: PersonaAttestation | undefined;
  try {
    attestation = delegated.attestation ?? (delegated.attestationPath ? readAttestation(delegated.attestationPath) : undefined) ?? findAttestation(options, runtimeName, delegated.runId)?.attestation;
  } catch (error) {
    return { accepted: false, runtimeName, output: delegated.output, errors: [`host-authored persona attestation could not be read: ${error instanceof Error ? error.message : String(error)}`], ordinaryAccepted: delegated.ordinaryAccepted === true, personaAccepted: false, delegated: true };
  }
  if (!attestation) return { accepted: false, runtimeName, output: delegated.output, errors: ["host-authored persona attestation is missing"], ordinaryAccepted: delegated.ordinaryAccepted === true, personaAccepted: false, delegated: true };
  const boundAttestation = delegated.launchContractDigest && !attestation.launchContractDigest
    ? { ...attestation, launchContractDigest: delegated.launchContractDigest }
    : attestation;
  const verification = verifyAttestation(boundAttestation, {
    runtimeName,
    role: selected.persona.contract.role,
    runId: delegated.runId,
    childIndex: delegated.childIndex,
    contractDigest: selected.persona.contractDigest,
    agentFileDigest: selected.persona.agentFileDigest,
    launchContractDigest: delegated.launchContractDigest,
    methodHashes: Object.fromEntries(selected.persona.methods.map((method) => [method.id, method.bodySha256])),
    ...(options.independentFrom ? { notSameAs: options.independentFrom } : {}),
  });
  const ordinaryAccepted = delegated.ordinaryAccepted === true;
  const errors = [...verification.errors];
  if (!ordinaryAccepted) errors.push(delegated.ordinaryAcceptanceReason ?? "ordinary pi-subagents acceptance did not pass");
  return { accepted: verification.valid && ordinaryAccepted, runtimeName, output: delegated.output, attestation: boundAttestation, errors, ordinaryAccepted, personaAccepted: verification.valid, delegated: true };
}

export function packagePreflight(packageRoot: string, runtimeName: string): { valid: boolean; persona?: PersonaFile; errors: string[]; childExtension: string } {
  let result: ReturnType<typeof validatePersonaFile>;
  try {
    result = validatePersonaFile(resolvePersonaPath(packageRoot, runtimeName));
  } catch (error) {
    result = { valid: false, path: runtimeName, errors: [error instanceof Error ? error.message : String(error)], warnings: [] };
  }
  const childExtension = resolve(packageRoot, "extensions", "persona-child.ts");
  const errors = [...result.errors];
  if (!existsSync(childExtension)) errors.push("child enforcement extension is missing");
  return { valid: result.valid && errors.length === 0, persona: result.persona, errors, childExtension };
}
