import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const PERSONA_CONTRACT_SCHEMA = "pi.persona-contract/v1" as const;
export const PERSONA_METHOD_SCHEMA = "pi.persona-method/v1" as const;
export const SUPPORTED_AUTHORITIES = [
  "strategy-read-only",
  "planning-read-only",
  "implementation-writer",
  "independent-review-read-only",
  "release-prepare",
  "retrospective-read-only",
] as const;
export type AuthorityCategory = (typeof SUPPORTED_AUTHORITIES)[number];

export type Disposition = "applied" | "not_applicable";
export type ProviderRequirement = "required_if_available_and_relevant" | "optional";

export interface PersonaContract {
  schema: typeof PERSONA_CONTRACT_SCHEMA;
  role: string;
  runtimeName: string;
  authority: AuthorityCategory;
  requiredMethods: string[];
  activation: {
    requiredBeforeSubstantiveTools: boolean;
    requirePlannedApplication: boolean;
  };
  completion: {
    requireDisposition: boolean;
    allowedDispositions: Disposition[];
    maxRepairTurns: number;
  };
  providers: {
    contextMode: ProviderRequirement;
    jcodemunch: ProviderRequirement;
    nativeFallback: "allowed_with_degraded_evidence";
  };
  [key: string]: unknown;
}

export interface EmbeddedMethod {
  id: string;
  license: string;
  sourceRepository: string;
  sourceCommit: string;
  sourcePath: string;
  bodySha256: string;
  body: string;
}

export interface PersonaFile {
  path: string;
  source: string;
  frontmatter: Record<string, string>;
  contract: PersonaContract;
  methods: EmbeddedMethod[];
  contractDigest: string;
  agentFileDigest: string;
}

export interface PersonaValidationResult {
  valid: boolean;
  path: string;
  errors: string[];
  warnings: string[];
  persona?: PersonaFile;
  role?: string;
  runtimeName?: string;
  requiredMethodCount?: number;
}

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const METHOD_ID = /^persona-team-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseFrontmatter(source: string, errors: string[]): Record<string, string> {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) {
    errors.push("missing YAML frontmatter");
    return {};
  }
  const values: Record<string, string> = {};
  let blockKey: string | undefined;
  const block: string[] = [];
  const flush = () => {
    if (blockKey) values[blockKey] = block.join("\n").trim();
    blockKey = undefined;
    block.length = 0;
  };
  for (const line of match[1].split("\n")) {
    const item = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (item) {
      flush();
      const value = item[2].trim();
      if (value) values[item[1]] = value.replace(/^['"]|['"]$/g, "");
      else blockKey = item[1];
      continue;
    }
    if (blockKey && /^\s+/.test(line)) block.push(line.trim());
  }
  flush();
  return values;
}

function parseJsonMarkers<T>(source: string, marker: string): { values: T[]; count: number } {
  const values: T[] = [];
  const pattern = new RegExp(`<!--\\s*${marker}:v1\\s*([\\s\\S]*?)\\s*-->`, "g");
  for (const match of source.matchAll(pattern)) {
    try {
      values.push(JSON.parse(match[1]) as T);
    } catch {
      // The caller reports this marker as malformed through the count/parse error.
    }
  }
  return { values, count: [...source.matchAll(new RegExp(`<!--\\s*${marker}:v1`, "g"))].length };
}

function parseContract(source: string, errors: string[]): PersonaContract | undefined {
  const matches = [...source.matchAll(/<!--\s*pi-persona-contract:v1\s*([\s\S]*?)\s*-->/g)];
  if (matches.length !== 1) {
    errors.push(matches.length === 0 ? "missing persona contract" : "duplicate persona contract");
    return undefined;
  }
  let contract: PersonaContract;
  try {
    contract = JSON.parse(matches[0][1]) as PersonaContract;
  } catch {
    errors.push("persona contract is not valid JSON");
    return undefined;
  }
  if (contract.schema !== PERSONA_CONTRACT_SCHEMA) errors.push(`unsupported contract schema: ${String(contract.schema)}`);
  if (!contract.role || !SAFE_SLUG.test(contract.role)) errors.push("contract role is not a safe slug");
  if (contract.runtimeName !== `persona-team.${contract.role}`) errors.push("contract runtimeName does not match role");
  if (!SUPPORTED_AUTHORITIES.includes(contract.authority)) errors.push(`unsupported authority: ${String(contract.authority)}`);
  if (!Array.isArray(contract.requiredMethods) || contract.requiredMethods.length === 0) {
    errors.push("contract requiredMethods must be non-empty");
  } else {
    const ids = contract.requiredMethods;
    if (new Set(ids).size !== ids.length) errors.push("contract requiredMethods contain duplicates");
    for (const id of ids) if (!METHOD_ID.test(id)) errors.push(`invalid required method ID: ${id}`);
  }
  if (contract.activation?.requiredBeforeSubstantiveTools !== true) errors.push("activation gate is not required");
  if (contract.activation?.requirePlannedApplication !== true) errors.push("planned application is not required");
  if (contract.completion?.requireDisposition !== true) errors.push("method disposition is not required");
  if (!Array.isArray(contract.completion?.allowedDispositions) || contract.completion.allowedDispositions.join(",") !== "applied,not_applicable") {
    errors.push("completion allowedDispositions must be applied and not_applicable");
  }
  if (!Number.isInteger(contract.completion?.maxRepairTurns) || contract.completion.maxRepairTurns < 0) errors.push("completion maxRepairTurns must be a non-negative integer");
  if (contract.providers?.contextMode !== "required_if_available_and_relevant") errors.push("context-mode provider policy is unsupported");
  if (contract.providers?.jcodemunch !== "required_if_available_and_relevant") errors.push("jCodeMunch provider policy is unsupported");
  if (contract.providers?.nativeFallback !== "allowed_with_degraded_evidence") errors.push("native fallback policy is unsupported");
  return contract;
}

function parseMethods(source: string, errors: string[]): EmbeddedMethod[] {
  const metadataMatches = [...source.matchAll(/<!--\s*pi-persona-method:v1\s*([\s\S]*?)\s*-->/g)];
  const bodyMatches = [...source.matchAll(/<pi-persona-method-body\s+id="([^"]+)">([\s\S]*?)<\/pi-persona-method-body>/g)];
  const methods: EmbeddedMethod[] = [];
  if (metadataMatches.length !== bodyMatches.length) errors.push(`method metadata/body count mismatch (${metadataMatches.length}/${bodyMatches.length})`);
  const bodies = new Map<string, string>();
  for (const bodyMatch of bodyMatches) {
    const id = bodyMatch[1];
    if (bodies.has(id)) errors.push(`duplicate method body ID: ${id}`);
    bodies.set(id, bodyMatch[2]);
  }
  const seen = new Set<string>();
  for (let i = 0; i < metadataMatches.length; i++) {
    const metadataMatch = metadataMatches[i];
    let metadata: Omit<EmbeddedMethod, "body">;
    try {
      metadata = JSON.parse(metadataMatch[1]) as Omit<EmbeddedMethod, "body">;
    } catch {
      errors.push(`method metadata ${i + 1} is not valid JSON`);
      continue;
    }
    const id = String(metadata.id ?? "");
    if (!METHOD_ID.test(id)) errors.push(`invalid embedded method ID: ${id}`);
    if (seen.has(id)) errors.push(`duplicate embedded method ID: ${id}`);
    seen.add(id);
    const body = bodies.get(id);
    if (body === undefined) {
      errors.push(`missing embedded method body: ${id}`);
      continue;
    }
    const actualHash = sha256(body);
    if (metadata.bodySha256 !== actualHash) errors.push(`body hash mismatch for ${id}`);
    for (const field of ["license", "sourceRepository", "sourceCommit", "sourcePath", "bodySha256"]) {
      if (!metadata[field as keyof typeof metadata]) errors.push(`missing ${field} for ${id}`);
    }
    methods.push({ ...metadata, id, body });
  }
  for (const id of bodies.keys()) if (!seen.has(id)) errors.push(`undeclared embedded method body: ${id}`);
  return methods;
}

export function parsePersonaFile(source: string, filePath = "<memory>"): PersonaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const frontmatter = parseFrontmatter(source, errors);
  for (const field of ["name", "package", "description", "systemPromptMode", "inheritProjectContext", "inheritSkills", "defaultContext", "subagentOnlyExtensions"]) {
    if (!frontmatter[field]) errors.push(`missing frontmatter field: ${field}`);
  }
  if (frontmatter.package && frontmatter.package !== "persona-team") errors.push("frontmatter package must be persona-team");
  if (frontmatter.systemPromptMode && frontmatter.systemPromptMode !== "replace") errors.push("persona systemPromptMode must be replace");
  if (frontmatter.inheritSkills && frontmatter.inheritSkills !== "true") errors.push("persona inheritSkills must be true");
  const contract = parseContract(source, errors);
  const methods = parseMethods(source, errors);
  if (contract) {
    if (frontmatter.name && frontmatter.name !== contract.role) errors.push("frontmatter name does not match contract role");
    const required = new Set(contract.requiredMethods);
    const embedded = new Set(methods.map((method) => method.id));
    for (const id of required) if (!embedded.has(id)) errors.push(`missing embedded method: ${id}`);
    for (const id of embedded) if (!required.has(id)) errors.push(`undeclared embedded method: ${id}`);
    if (required.size !== embedded.size) warnings.push("required and embedded method sets differ");
    if (/skillPath\s*:|shared[- ]method|shared[- ]corpus|load\s+(?:this\s+)?(?:method|skill)\s+from|see\s+.*(?:methods|skills)\//i.test(source)) {
      errors.push("persona contains a required external/shared method reference");
    }
  }
  if (methods.length === 0) errors.push("no embedded methods found");
  if (!source.includes("## Completion Checklist") || !source.includes("## Completion Standard")) errors.push("missing completion sections");
  if (!source.includes("## Context Access Policy")) errors.push("missing context access policy");
  if (!source.includes("## Mandatory Method Protocol")) errors.push("missing mandatory method protocol");
  if (!contract) return { valid: false, path: filePath, errors, warnings };
  const persona: PersonaFile = {
    path: filePath,
    source,
    frontmatter,
    contract,
    methods,
    contractDigest: `sha256:${sha256(JSON.stringify(contract))}`,
    agentFileDigest: `sha256:${sha256(source)}`,
  };
  return {
    valid: errors.length === 0,
    path: filePath,
    errors,
    warnings,
    persona,
    role: contract.role,
    runtimeName: contract.runtimeName,
    requiredMethodCount: contract.requiredMethods.length,
  };
}

export function validatePersonaFile(filePath: string): PersonaValidationResult {
  try {
    return parsePersonaFile(readFileSync(filePath, "utf8"), filePath);
  } catch (error) {
    return { valid: false, path: filePath, errors: [`cannot read persona file: ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
  }
}

export function resolvePersonaPath(packageRoot: string, runtimeName: string): string {
  if (!runtimeName.startsWith("persona-team.")) throw new Error("persona runtime name must use persona-team. prefix");
  const slug = runtimeName.slice("persona-team.".length);
  if (!SAFE_SLUG.test(slug)) throw new Error("persona runtime name contains an unsafe slug");
  const root = resolve(packageRoot);
  const candidate = resolve(root, "agents", `${slug}.md`);
  if (!candidate.startsWith(`${resolve(root, "agents")}/`)) throw new Error("persona path escapes agents directory");
  return candidate;
}
