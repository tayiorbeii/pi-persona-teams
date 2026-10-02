import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * pi-mcp-adapter keeps one global metadata cache (~/.pi/agent/mcp-cache.json)
 * keyed only by server name, and pi-subagents rejects a cached entry whose
 * configHash differs from the definition it resolves for the persona's cwd.
 * When a project's .mcp.json defines the same server name differently, pi
 * sessions in that project and everywhere else keep overwriting each other's
 * entry, so persona preflight flips between "ready" and "Unresolved MCP
 * direct-tool selectors". Pinning pi's project override (.pi/mcp.json) to the
 * global definition gives every project the same configHash.
 */

type ServerDefinition = Record<string, unknown>;
type McpFile = { mcpServers?: Record<string, ServerDefinition>; [key: string]: unknown };

// Fields that pi-mcp-adapter and pi-subagents hash into a server's configHash.
const IDENTITY_FIELDS = [
  "command", "args", "socket", "env", "cwd", "url", "headers", "requestHeadersCommand", "auth",
  "protocolVersion", "bearerToken", "bearerTokenEnv", "exposeResources", "includeTools", "excludeTools",
] as const;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function serverIdentity(definition: ServerDefinition): string {
  return stable(Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, definition[field]])));
}

function readMcpFile(path: string): McpFile | undefined {
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${path} is not a JSON object`);
  return parsed as McpFile;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** pi treats a directory as a project root only when it already has .pi/ or .agents/; creating .pi/ would move that root. */
export function isPiProjectRoot(dir: string): boolean {
  return isDirectory(join(dir, ".pi")) || isDirectory(join(dir, ".agents"));
}

/** True when the override is untracked and ignored, or the directory is not in a Git checkout. */
export function overrideIsLocalOnly(dir: string): boolean {
  try {
    execFileSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  } catch {
    return true;
  }
  try {
    execFileSync("git", ["-C", dir, "check-ignore", "-q", ".pi/mcp.json"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export type PinStatus = "pinned" | "already-aligned" | "not-pi-root" | "override-not-ignored";

export interface PinPlan {
  projectDir: string;
  overridePath: string;
  status: PinStatus;
  /** Servers whose effective project definition differs from the global one. */
  divergent: string[];
  /** The override file content to write when status is "pinned". */
  next?: McpFile;
}

/**
 * Plans the .pi/mcp.json pin for the directory holding one project .mcp.json.
 * Only the named servers are pinned; every other key in an existing override
 * is preserved.
 */
export function planPin(projectMcpPath: string, global: Record<string, ServerDefinition>, servers: string[], checks: { isPiProjectRoot?: (dir: string) => boolean; overrideIsLocalOnly?: (dir: string) => boolean } = {}): PinPlan {
  const projectDir = dirname(projectMcpPath);
  const overridePath = join(projectDir, ".pi", "mcp.json");
  const project = readMcpFile(projectMcpPath)?.mcpServers ?? {};
  const override = readMcpFile(overridePath);
  const divergent = servers.filter((name) => {
    const globalDefinition = global[name];
    const effective = override?.mcpServers?.[name] ?? project[name];
    return globalDefinition !== undefined && effective !== undefined && serverIdentity(effective) !== serverIdentity(globalDefinition);
  });
  if (divergent.length === 0) return { projectDir, overridePath, status: "already-aligned", divergent };
  if (!(checks.isPiProjectRoot ?? isPiProjectRoot)(projectDir)) return { projectDir, overridePath, status: "not-pi-root", divergent };
  if (!(checks.overrideIsLocalOnly ?? overrideIsLocalOnly)(projectDir)) return { projectDir, overridePath, status: "override-not-ignored", divergent };
  const next: McpFile = { ...(override ?? {}), mcpServers: { ...(override?.mcpServers ?? {}) } };
  for (const name of divergent) next.mcpServers![name] = global[name]!;
  return { projectDir, overridePath, status: "pinned", divergent, next };
}
