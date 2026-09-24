import { existsSync } from "node:fs";
import * as nodeFs from "node:fs";
import { basename, dirname, resolve, relative, isAbsolute } from "node:path";
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

const READ_ONLY_COMMANDS = /^(?:pwd|ls(?:\s|$)|rg(?:\s|$)|grep(?:\s|$)|git\s+(?:status|log|show|diff|branch|rev-parse|ls-files|describe)(?:\s|$)|git\s+check-ignore(?:\s|$)|cat(?:\s|$)|head(?:\s|$)|tail(?:\s|$)|wc(?:\s|$)|bun\s+(?:test|run\s+(?:typecheck|verify:personas|verify:no-shared-corpus))(?:\s|$)|npm\s+(?:test|run\s+(?:typecheck|verify:personas|verify:no-shared-corpus))(?:\s|$)|node\s+--version(?:\s|$)|bun\s+--version(?:\s|$))/i;
const MUTATING_COMMAND = /(?:^|\s)(?:rm|mv|cp|mkdir|touch|install|add|commit|checkout|switch|reset|restore|push|pull|merge|rebase|deploy|publish|chmod|tee)(?:\s|$)|(?:^|\s)(?:--output(?:=|\s)|-o\s)/i;
const SHELL_CONTROL_SYNTAX = /[\r\n;&|`<>^]|\$\(|\$\{/;
const SHELL_INTERPRETER = /(?:^|\s)(?:sh|bash|zsh|dash|fish|cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh|python(?:\d+(?:\.\d+)*)?|py|node)(?:\s|$)/i;
const CONTEXT_MODE_READ_OPERATION = "(?:search|index|fetch_and_index)";
const JCODEMUNCH_READ_OPERATION = "(?:resolve_repo|plan_turn|search_symbols|search_text|get_symbol_source|get_file_outline|find_references|find_importers|get_blast_radius|get_changed_symbols|get_context_bundle|get_ranked_context|assemble_task_context|index_file|index_repo)";
const JDOCMUNCH_READ_OPERATION = "(?:search_sections|get_toc|get_toc_tree|get_section|get_sections|get_document_outline)";
const APPROVED_PROVIDER_READ_TOOL = new RegExp(
  `^(?:ctx_${CONTEXT_MODE_READ_OPERATION}|context[-_]?mode_(?:ctx_)?${CONTEXT_MODE_READ_OPERATION}|jcodemunch_${JCODEMUNCH_READ_OPERATION}|mcp__(?:context[-_]?mode)__(?:ctx_)?${CONTEXT_MODE_READ_OPERATION}|mcp__jcodemunch__(?:jcodemunch_)?${JCODEMUNCH_READ_OPERATION}|mcp:(?:context[-_]?mode)[:/](?:ctx_)?${CONTEXT_MODE_READ_OPERATION}|mcp:jcodemunch[:/](?:jcodemunch_)?${JCODEMUNCH_READ_OPERATION}|jdocmunch_${JDOCMUNCH_READ_OPERATION}|mcp__jdocmunch__(?:jdocmunch_)?${JDOCMUNCH_READ_OPERATION}|mcp:jdocmunch[:/](?:jdocmunch_)?${JDOCMUNCH_READ_OPERATION})$`,
  "i",
);
// context-mode execute tools run caller-supplied code, so they are gated by input rather than by name:
// shell code and batch commands pass the same shell gate as `bash`; JS/TS analysis code must stay
// inside a static capability screen and may only read files inside the assigned workspace.
const CONTEXT_MODE_EXECUTE_TOOL = /^(?:ctx_|context[-_]?mode_(?:ctx_)?|mcp__context[-_]?mode__(?:ctx_)?|mcp:context[-_]?mode[:/](?:ctx_)?)(execute_file|execute|batch_execute)$/i;
const ANALYSIS_LANGUAGE = /^(?:javascript|js|typescript|ts)$/i;
const SHELL_LANGUAGE = /^(?:shell|sh|bash|zsh)$/i;
// Screens out host capabilities (modules, process, network, timers, code evaluation) and the usual
// routes to them (constructor/prototype walks, computed calls, escaped or char-code-built names).
// This is a guardrail for persona behavior, not an isolation boundary against a hostile author.
const UNSAFE_ANALYSIS_CODE = /\b(?:require|import|process|Bun|Deno|globalThis|global|module|exports|eval|Function|AsyncFunction|GeneratorFunction|constructor|prototype|__proto__|__defineGetter__|__lookupGetter__|Reflect|Proxy|WebAssembly|fetch|XMLHttpRequest|WebSocket|Worker|SharedArrayBuffer|Atomics|setTimeout|setInterval|setImmediate|queueMicrotask|getPrototypeOf|setPrototypeOf|getOwnPropertyDescriptors?|defineProperty|fromCharCode|fromCodePoint|atob|btoa)\b|\b(?:self|window)\s*[.[]|\bwith\s*\(|\\[ux]|\]\s*[(`]/;
const OCTOCODE_READ_COMMAND = /^npx\s+-y\s+octocode@18\.3\.0\s+(?:--help|status(?:\s+--json)?|auth\s+status|tools\s+(?:ghSearchCode|ghGetFileContent|ghViewRepoStructure|ghSearchRepos|ghSearchPullRequests|ghSearchIssues|ghSearchCommits|npmSearch)(?:\s+--scheme|\s+--queries\s+.+?(?:\s+--(?:json|compact))?)?)\s*$/i;
const RUST_VALIDATION_COMMAND = /^(?:cargo\s+(?:\+\S+\s+)?--version|rustc\s+--version|cargo\s+(?:\+\S+\s+)?(?:test|check|clippy|build|metadata|tree)(?:\s+.*)?|cargo\s+(?:\+\S+\s+)?fmt(?=[^\r\n]*--check(?:\s|$))(?:\s+.*)?)$/i;
const CARGO_COMMAND = /^cargo(?:\s|$)/i;
const CARGO_RELEASE_OPERATION = /(?:^|\s)(?:publish|yank|owner|login|logout)(?:\s|$)/i;
const CARGO_SOURCE_MUTATION = /(?:^|\s)(?:add|fix|fmt|generate-lockfile|init|new|remove|set-version|update|upgrade|vendor)(?:\s|$)/i;
const READ_TOOL = /^(?:read|read_file|grep|find|ffgrep|fffind|glob|search|search_code|web_search|web_fetch|list|ls|git_diff|git_status)$/i;
const FINALIZATION_TOOL = /^structured_output$/i;
const WRITE_TOOL = /^(?:write|write_file|edit|edit_file|apply_patch|patch|delete|remove|mkdir|move|copy)$/i;

const WRITE_PATH_KEYS = new Set(["path", "filepath", "filename", "target", "destination", "dest", "newpath", "to", "outputpath"]);

function pathsFromInput(input: Record<string, unknown>): string[] | undefined {
  const paths: string[] = [];
  let invalid = false;

  const visit = (value: unknown, key?: string): void => {
    if (key && WRITE_PATH_KEYS.has(key.toLowerCase())) {
      const values = Array.isArray(value) ? value : [value];
      if (values.length === 0 || values.some((item) => typeof item !== "string" || item.trim() === "")) invalid = true;
      else paths.push(...(values as string[]));
      return;
    }
    if (Array.isArray(value)) for (const item of value) visit(item);
    else if (value && typeof value === "object") for (const [nestedKey, nestedValue] of Object.entries(value)) visit(nestedValue, nestedKey);
  };

  visit(input);
  return invalid || paths.length === 0 ? undefined : paths;
}

function canonicalPath(candidate: string): string | undefined {
  try {
    let existing = resolve(candidate);
    const missingSegments: string[] = [];
    while (!existsSync(existing)) {
      const parent = dirname(existing);
      if (parent === existing) return undefined;
      missingSegments.unshift(basename(existing));
      existing = parent;
    }
    return resolve((nodeFs as unknown as { realpathSync(path: string): string }).realpathSync(existing), ...missingSegments);
  } catch {
    return undefined;
  }
}

export function isInsideWorkspace(workspace: string, candidate: string): boolean {
  const workspacePath = canonicalPath(workspace);
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(workspace, candidate);
  const candidatePath = canonicalPath(absolute);
  if (!workspacePath || !candidatePath) return false;
  const rel = relative(workspacePath, candidatePath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function workspaceRelativePath(workspace: string, candidate: string): string {
  const workspacePath = canonicalPath(workspace) ?? resolve(workspace);
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(workspace, candidate);
  const candidatePath = canonicalPath(absolute) ?? absolute;
  const rel = relative(workspacePath, candidatePath).replaceAll("\\", "/");
  return rel === "" ? "." : rel;
}

function isProtectedPath(workspace: string, candidate: string): boolean {
  const normalized = workspaceRelativePath(workspace, candidate);
  return /^(?:\.pi-persona|agents|extensions)(?:\/|$)|^(?:package\.json|tsconfig\.json)$/.test(normalized);
}

function isPlanningArtifact(workspace: string, candidate: string): boolean {
  const normalized = workspaceRelativePath(workspace, candidate);
  return /^(?:plans|docs\/plans|docs\/testing|docs\/reviews)(?:\/|$)/.test(normalized);
}

function commandAllowedForReadOnly(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed || SHELL_CONTROL_SYNTAX.test(trimmed)) return false;
  if (OCTOCODE_READ_COMMAND.test(trimmed)) return true;
  if (RUST_VALIDATION_COMMAND.test(trimmed)) return true;
  if (CARGO_COMMAND.test(trimmed)) return !CARGO_RELEASE_OPERATION.test(trimmed) && !CARGO_SOURCE_MUTATION.test(trimmed);
  if (MUTATING_COMMAND.test(trimmed)) return false;
  if (SHELL_INTERPRETER.test(trimmed) && !/^node\s+--version(?:\s|$)/i.test(trimmed)) return false;
  return READ_ONLY_COMMANDS.test(trimmed);
}

function commandAllowedForImplementation(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed || SHELL_CONTROL_SYNTAX.test(trimmed)) return false;
  if (CARGO_COMMAND.test(trimmed)) return !CARGO_RELEASE_OPERATION.test(trimmed);
  return commandAllowedForReadOnly(trimmed);
}

function shellAllowedForAuthority(authority: string, command: string): boolean {
  return authority === "implementation-writer" ? commandAllowedForImplementation(command) : commandAllowedForReadOnly(command);
}

function evaluateContextModeExecute(operation: string, input: Record<string, unknown>, workspace: string, authority: string): { allowed: boolean; reason: string } {
  if (operation === "batch_execute") {
    const commands = input.commands;
    if (commands !== undefined && !Array.isArray(commands)) return { allowed: false, reason: "context-mode batch commands must be a list of {label, command}" };
    for (const entry of (commands ?? []) as unknown[]) {
      const command = entry && typeof entry === "object" ? (entry as Record<string, unknown>).command : undefined;
      if (typeof command !== "string" || !shellAllowedForAuthority(authority, command)) {
        return { allowed: false, reason: `context-mode batch command is outside this role's shell boundary: ${String(command).slice(0, 80)}` };
      }
    }
    return { allowed: true, reason: "context-mode batch within the role's shell boundary" };
  }

  if (operation === "execute_file") {
    const path = input.path;
    if (typeof path !== "string" || path.trim() === "" || !isInsideWorkspace(workspace, path)) {
      return { allowed: false, reason: "context-mode execute_file path must be explicit and inside the assigned workspace; ask the parent to place handoff inputs (issue snapshots, plans) inside the checkout rather than /tmp" };
    }
  }

  const language = typeof input.language === "string" ? input.language.trim() : "";
  const code = typeof input.code === "string" ? input.code : "";
  if (!code.trim()) return { allowed: false, reason: "context-mode execute requires explicit code" };
  if (SHELL_LANGUAGE.test(language)) {
    return shellAllowedForAuthority(authority, code)
      ? { allowed: true, reason: "context-mode shell code within the role's shell boundary" }
      : { allowed: false, reason: "context-mode shell code is outside this role's shell boundary; use a single bounded read-only command" };
  }
  if (!ANALYSIS_LANGUAGE.test(language)) return { allowed: false, reason: "context-mode execute is limited to javascript/typescript analysis or bounded shell commands" };
  const unsafe = code.match(UNSAFE_ANALYSIS_CODE)?.[0];
  if (unsafe) return { allowed: false, reason: `context-mode analysis code may only transform provided data; disallowed capability: ${unsafe.slice(0, 40)}` };
  return { allowed: true, reason: "context-mode pure analysis code" };
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
  options: { skipMethodGate?: boolean } = {},
): PolicyDecision {
  const substantive = isSubstantiveCall(tool);
  const missing = missingActivations(ledger);
  if (substantive && missing.length > 0 && !options.skipMethodGate) {
    const reason = `activate every mandatory method before substantive work; missing: ${missing.join(", ")}`;
    recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: summarizeInput(tool.input), action: "blocked", reason });
    return { allowed: false, reason, missingMethods: missing, substantive: true };
  }

  const input = tool.input ?? {};
  if (tool.toolName === "persona_contract" || tool.toolName.startsWith("persona_contract.")) return { allowed: true, reason: "persona protocol tool", substantive: false };
  if (APPROVED_PROVIDER_READ_TOOL.test(tool.toolName)) return { allowed: true, reason: "approved read-only provider operation", substantive };
  const executeOperation = tool.toolName.match(CONTEXT_MODE_EXECUTE_TOOL)?.[1]?.toLowerCase();
  if (executeOperation) {
    const decision = evaluateContextModeExecute(executeOperation, input, workspace, ledger.authority);
    recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: summarizeInput(input), action: decision.allowed ? "allowed" : "blocked", reason: decision.reason });
    return { ...decision, substantive };
  }
  if (FINALIZATION_TOOL.test(tool.toolName)) {
    recordPolicyEvent(ledger, { toolName: tool.toolName, action: "allowed", reason: "structured finalization after mandatory method activation" });
    return { allowed: true, reason: "structured finalization after mandatory method activation", substantive };
  }
  if (tool.toolName === "subagent" || tool.toolName === "persona_team") {
    const reason = "persona children cannot fan out or replace the parent lifecycle authority";
    recordPolicyEvent(ledger, { toolName: tool.toolName, action: "blocked", reason });
    return { allowed: false, reason, substantive };
  }

  const authority = ledger.authority;
  const candidatePaths = pathsFromInput(input);
  if (WRITE_TOOL.test(tool.toolName)) {
    if (!candidatePaths || candidatePaths.some((candidate) => !isInsideWorkspace(workspace, candidate))) {
      const reason = "every write path must be explicit and inside the assigned workspace; a report/output path routed outside the checkout (e.g. an external pi-subagents output directory) must be reassigned to an in-checkout path instead";
      recordPolicyEvent(ledger, { toolName: tool.toolName, action: "blocked", reason });
      return { allowed: false, reason, substantive };
    }
    const inputSummary = candidatePaths.join(", ").slice(0, 160);
    if (authority === "implementation-writer") {
      if (candidatePaths.some((candidate) => isProtectedPath(workspace, candidate))) {
        const reason = "persona and enforcement files are protected during a product implementation";
        recordPolicyEvent(ledger, { toolName: tool.toolName, action: "blocked", inputSummary, reason });
        return { allowed: false, reason, substantive };
      }
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary, action: "allowed", reason: "assigned implementation workspace" });
      return { allowed: true, reason: "assigned implementation workspace", substantive };
    }
    if (["planning-read-only", "strategy-read-only", "independent-review-read-only", "release-prepare", "retrospective-read-only"].includes(authority) && candidatePaths.every((candidate) => isPlanningArtifact(workspace, candidate))) {
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary, action: "allowed", reason: "assigned planning artifact path" });
      return { allowed: true, reason: "assigned planning artifact path", substantive };
    }
    const reason = authority === "independent-review-read-only" ? "reviewers cannot edit candidate files; write only a review artifact" : "role is read-only and cannot edit source files";
    recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary, action: "blocked", reason });
    return { allowed: false, reason, substantive };
  }

  if (tool.toolName === "bash" || tool.toolName === "shell") {
    const command = typeof input.command === "string" ? input.command : "";
    if (authority === "implementation-writer") {
      if (!commandAllowedForImplementation(command)) {
        const reason = "implementation shell access is limited to approved validation and read-only commands";
        recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: command.slice(0, 160), action: "blocked", reason });
        return { allowed: false, reason, substantive };
      }
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: command.slice(0, 160), action: "allowed", reason: "implementation validation boundary" });
      return { allowed: true, reason: "implementation validation boundary", substantive };
    }
    if (!commandAllowedForReadOnly(command)) {
      const reason = "unknown or mutating shell command is not permitted for this read-only role";
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: command.slice(0, 160), action: "blocked", reason });
      return { allowed: false, reason, substantive };
    }
    recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: command.slice(0, 160), action: "allowed", reason: "bounded read-only command" });
    return { allowed: true, reason: "bounded read-only command", substantive };
  }

  if (READ_TOOL.test(tool.toolName)) {
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
