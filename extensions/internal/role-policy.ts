import { resolve, relative, isAbsolute } from "node:path";
import type { PersonaLedger } from "./ledger.ts";
import { missingActivations, recordPolicyEvent } from "./ledger.ts";

export interface ToolCall {
  toolName: string;
  input?: Record<string, unknown>;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  missingMethods?: string[];
  substantive?: boolean;
}

const READ_ONLY_COMMANDS = /^(?:pwd|ls(?:\s|$)|find(?:\s|$)|rg(?:\s|$)|grep(?:\s|$)|git\s+(?:status|log|show|diff|branch|rev-parse|ls-files|describe)(?:\s|$)|git\s+check-ignore(?:\s|$)|cat(?:\s|$)|head(?:\s|$)|tail(?:\s|$)|wc(?:\s|$)|bun\s+(?:test|run\s+(?:typecheck|verify:personas|verify:no-shared-corpus))(?:\s|$)|npm\s+(?:test|run\s+(?:typecheck|verify:personas|verify:no-shared-corpus))(?:\s|$)|node\s+--version(?:\s|$)|bun\s+--version(?:\s|$))/i;
const MUTATING_COMMAND = /(?:^|\s)(?:rm|mv|cp|mkdir|touch|install|add|commit|checkout|switch|reset|restore|push|pull|merge|rebase|deploy|publish|chmod|tee)(?:\s|$)|(?:^|\s)(?:--output(?:=|\s)|-o\s)|>{1,2}\s*[^>]/i;
const PROVIDER_TOOL = /(?:context[_-]?mode|jcode|mcp:|mcp__)/i;
const READ_TOOL = /^(?:read|read_file|grep|find|glob|search|search_code|web_search|web_fetch|list|ls|git_diff|git_status)$/i;
const WRITE_TOOL = /^(?:write|write_file|edit|edit_file|apply_patch|patch|delete|remove|mkdir|move|copy)$/i;

function pathFromInput(input: Record<string, unknown>): string | undefined {
  for (const key of ["path", "filePath", "filename", "target"]) if (typeof input[key] === "string") return input[key] as string;
  return undefined;
}

function isInsideWorkspace(workspace: string, candidate: string): boolean {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(workspace, candidate);
  const rel = relative(resolve(workspace), absolute);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function workspaceRelativePath(workspace: string, candidate: string): string {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(workspace, candidate);
  const rel = relative(resolve(workspace), absolute).replaceAll("\\", "/");
  return rel === "" ? "." : rel;
}

function isProtectedPath(workspace: string, candidate: string): boolean {
  const normalized = workspaceRelativePath(workspace, candidate);
  return /^(?:agents|extensions)(?:\/|$)|^(?:package\.json|tsconfig\.json)$/.test(normalized);
}

function isPlanningArtifact(workspace: string, candidate: string): boolean {
  const normalized = workspaceRelativePath(workspace, candidate);
  return /^(?:plans|docs\/plans|docs\/testing|docs\/reviews)(?:\/|$)/.test(normalized);
}

function commandAllowedForReadOnly(command: string): boolean {
  const trimmed = command.trim();
  return !MUTATING_COMMAND.test(trimmed) && READ_ONLY_COMMANDS.test(trimmed);
}

export function isSubstantiveCall(tool: ToolCall): boolean {
  if (tool.toolName === "persona_contract" || tool.toolName === "persona_contract.activate" || tool.toolName === "persona_contract.status") return false;
  if (/^(?:provider_status|context_mode\.available|jcodemunch\.available)$/.test(tool.toolName)) return false;
  return true;
}

export function evaluateToolCall(
  ledger: PersonaLedger,
  tool: ToolCall,
  workspace: string,
): PolicyDecision {
  const substantive = isSubstantiveCall(tool);
  const missing = missingActivations(ledger);
  if (substantive && missing.length > 0) {
    const reason = `activate every mandatory method before substantive work; missing: ${missing.join(", ")}`;
    recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: summarizeInput(tool.input), action: "blocked", reason });
    return { allowed: false, reason, missingMethods: missing, substantive: true };
  }

  const input = tool.input ?? {};
  if (tool.toolName === "persona_contract" || tool.toolName.startsWith("persona_contract.")) return { allowed: true, reason: "persona protocol tool", substantive: false };
  if (PROVIDER_TOOL.test(tool.toolName)) return { allowed: true, reason: "provider boundary; provider observer records use", substantive };
  if (tool.toolName === "subagent" || tool.toolName === "persona_team") {
    const reason = "persona children cannot fan out or replace the parent lifecycle authority";
    recordPolicyEvent(ledger, { toolName: tool.toolName, action: "blocked", reason });
    return { allowed: false, reason, substantive };
  }

  const authority = ledger.authority;
  const candidatePath = pathFromInput(input);
  if (WRITE_TOOL.test(tool.toolName)) {
    if (!candidatePath || !isInsideWorkspace(workspace, candidatePath)) {
      const reason = "write is outside the assigned workspace";
      recordPolicyEvent(ledger, { toolName: tool.toolName, action: "blocked", reason });
      return { allowed: false, reason, substantive };
    }
    if (authority === "implementation-writer") {
      if (isProtectedPath(workspace, candidatePath)) {
        const reason = "persona and enforcement files are protected during a product implementation";
        recordPolicyEvent(ledger, { toolName: tool.toolName, action: "blocked", inputSummary: candidatePath, reason });
        return { allowed: false, reason, substantive };
      }
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: candidatePath, action: "allowed", reason: "assigned implementation workspace" });
      return { allowed: true, reason: "assigned implementation workspace", substantive };
    }
    if (["planning-read-only", "strategy-read-only", "independent-review-read-only", "release-prepare", "retrospective-read-only"].includes(authority) && isPlanningArtifact(workspace, candidatePath)) {
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: candidatePath, action: "allowed", reason: "assigned planning artifact path" });
      return { allowed: true, reason: "assigned planning artifact path", substantive };
    }
    const reason = authority === "independent-review-read-only" ? "reviewers cannot edit candidate files; write only a review artifact" : "role is read-only and cannot edit source files";
    recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: candidatePath, action: "blocked", reason });
    return { allowed: false, reason, substantive };
  }

  if (tool.toolName === "bash" || tool.toolName === "shell") {
    const command = typeof input.command === "string" ? input.command : "";
    if (authority === "implementation-writer") {
      if (/(?:deploy|publish|release|git\s+(?:commit|push|reset|checkout|switch|merge|rebase))/i.test(command)) {
        const reason = "release and git mutation require separate approval";
        recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: command.slice(0, 160), action: "blocked", reason });
        return { allowed: false, reason, substantive };
      }
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: command.slice(0, 160), action: "allowed", reason: "implementation validation/build boundary" });
      return { allowed: true, reason: "implementation validation/build boundary", substantive };
    }
    if (!commandAllowedForReadOnly(command)) {
      const reason = "unknown or mutating shell command is not permitted for this read-only role";
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: command.slice(0, 160), action: "blocked", reason });
      return { allowed: false, reason, substantive };
    }
    recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: command.slice(0, 160), action: "allowed", reason: "bounded read-only command" });
    return { allowed: true, reason: "bounded read-only command", substantive };
  }

  if (READ_TOOL.test(tool.toolName) || tool.toolName.startsWith("mcp")) {
    recordPolicyEvent(ledger, { toolName: tool.toolName, action: "allowed", reason: "bounded read/retrieval operation" });
    return { allowed: true, reason: "bounded read/retrieval operation", substantive };
  }

  const reason = "tool is not declared safe for this persona authority; escalate before use";
  recordPolicyEvent(ledger, { toolName: tool.toolName, action: "blocked", reason });
  return { allowed: false, reason, substantive };
}

function summarizeInput(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const keys = Object.keys(input).slice(0, 4);
  return keys.map((key) => `${key}=${String(input[key]).slice(0, 80)}`).join(" ");
}
