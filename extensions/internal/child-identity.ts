import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CHILD_AGENT_ENV = "PI_SUBAGENT_CHILD_AGENT";
export const RUN_ID_ENV = "PI_SUBAGENT_RUN_ID";
export const CHILD_INDEX_ENV = "PI_SUBAGENT_CHILD_INDEX";

export interface ChildIdentity {
  runtimeName: string;
  runId: string;
  childIndex: number;
}

export function readChildIdentity(environment: Record<string, string | undefined> = process.env): ChildIdentity {
  const runtimeName = environment[CHILD_AGENT_ENV];
  if (!runtimeName) throw new Error(`${CHILD_AGENT_ENV} is required for a persona child`);
  const runId = environment[RUN_ID_ENV] ?? "standalone";
  const rawIndex = environment[CHILD_INDEX_ENV] ?? "0";
  const childIndex = Number(rawIndex);
  if (!Number.isInteger(childIndex) || childIndex < 0) throw new Error(`${CHILD_INDEX_ENV} must be a non-negative integer`);
  return { runtimeName, runId, childIndex };
}

export function packageRootFromChildExtension(moduleUrl: string): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "..");
}

export function personaFileFromIdentity(identity: ChildIdentity, packageRoot: string): string {
  if (!identity.runtimeName.startsWith("persona-team.")) throw new Error("child is not a persona-team agent");
  const slug = identity.runtimeName.slice("persona-team.".length);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("unsafe persona slug");
  const root = resolve(packageRoot);
  const agents = resolve(root, "agents");
  const file = resolve(agents, `${slug}.md`);
  if (dirname(file) !== agents || basename(file) !== `${slug}.md`) throw new Error("persona path escaped package agents directory");
  return file;
}
