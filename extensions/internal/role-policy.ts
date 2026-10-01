import { existsSync } from "node:fs";
import * as nodeFs from "node:fs";
import { basename, dirname, join, resolve, relative, isAbsolute } from "node:path";
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

const READ_ONLY_COMMANDS = /^(?:pwd|ls(?:\s|$)|rg(?:\s|$)|grep(?:\s|$)|git\s+(?:status|log|show|diff|rev-parse|ls-files|ls-tree|cat-file|blame|grep|merge-base|rev-list|describe)(?:\s|$)|git\s+check-ignore(?:\s|$)|cat(?:\s|$)|head(?:\s|$)|printf(?:\s|$)|echo(?:\s|$)|shasum(?:\s|$)|sha256sum(?:\s|$)|stat(?:\s|$)|du(?:\s|$)|find(?:\s|$)|tail(?:\s|$)|wc(?:\s|$)|bun\s+(?:test|run\s+(?:typecheck|verify:personas|verify:no-shared-corpus))(?:\s|$)|npm\s+(?:test|run\s+(?:typecheck|verify:personas|verify:no-shared-corpus))(?:\s|$)|node\s+--version(?:\s|$)|bun\s+--version(?:\s|$))/i;
const MUTATING_COMMAND = /(?:^|\s)(?:rm|mv|cp|mkdir|touch|install|add|commit|checkout|switch|reset|restore|push|pull|merge|rebase|deploy|publish|chmod|tee)(?:\s|$)|(?:^|\s)(?:--output(?:=|\s)|-o\s)/i;
const SHELL_CONTROL_SYNTAX = /[\r\n;&|`<>^]|\$\(|\$\{/;
// Redirects, substitution, and background jobs; `;`, newlines, `&&`, `||`, and `|` are handled structurally.
const SHELL_UNSAFE_SYNTAX = /[\r`<>^]|\$\(|\$\{/;
const MAX_SEQUENCE_COMMANDS = 16;
// find actions that delete, execute, or write files.
const FIND_UNSAFE_ACTION = /(?:^|\s)-(?:delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)(?:\s|$)/i;
// ripgrep preprocessors run an arbitrary program per file.
const RG_EXTERNAL_PROGRAM = /^rg\s(?:.*\s)?--pre(?:=|\s|$)/i;
// Listing-only `git branch`; any other argument creates, renames, or deletes a branch.
const GIT_BRANCH_LIST = /^git\s+branch(?:\s+(?:-a|-r|-v|-vv|--all|--remotes|--verbose|--show-current|--sort=\S+|--format=\S+|(?:--list|--contains|--no-contains|--merged|--no-merged|--points-at)(?:\s+[^-\s]\S*)?))*\s*$/i;
// Git options that hand content to configured external programs or a pager.
const GIT_EXTERNAL_PROGRAM = /^git\s.*(?:\s)(?:--ext-diff|--textconv|-O\S*|--open-files-in-pager\S*)(?:\s|$)/i;
// Stages allowed after the first command of a pipeline: stdin-only filters with no file-writing or exec options.
const PIPE_FILTER = [
  /^nl(?:\s+-b\s?a)?$/,
  /^sed\s+-n\s+(['"]?)\d+(?:,\d+)?p\1$/,
  /^(?:head|tail)(?:\s+-n\s*\d+|\s+-\d+)?$/,
  /^wc(?:\s+-[lwc])?$/,
  /^sort(?:\s+-[nru]+)?$/,
  /^uniq(?:\s+-c)?$/,
  /^grep(?:\s+-[invcwFE]+)*\s+(?:'[^']*'|"[^"$\\]*"|[^\s'"]+)$/,
];
const READ_ONLY_SHELL_GUIDANCE = "every command in a ;/&&/|| sequence must itself be allowed (no redirects, substitution, or background jobs); pipes may only feed nl, sed -n 'A,Bp', head, tail, wc, sort, uniq, or grep. Revision reads such as `git show <rev>:<path>`, `git ls-tree -r <rev>`, `git diff <a> <b>`, and `git cat-file -p <rev>:<path>` are allowed";
const SHELL_INTERPRETER = /(?:^|\s)(?:sh|bash|zsh|dash|fish|cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh|python(?:\d+(?:\.\d+)*)?|py|node)(?:\s|$)/i;
// Pi Context Capsules model tools read only evidence already captured from native read/bash/grep:
// no shell, writes, network, or new file access, so every role may use them.
const CAPSULES_READ_OPERATION = "capsule_(?:recall|analyze)";
// Legacy: context-mode is disabled for persona children (Capsules refuses to run beside it), but
// a host that still exposes it stays inside these gates rather than gaining an unchecked tool.
const CONTEXT_MODE_READ_OPERATION = "(?:search|index|fetch_and_index)";
const JCODEMUNCH_READ_OPERATION = "(?:resolve_repo|plan_turn|search_symbols|search_text|get_symbol_source|get_file_outline|find_references|find_importers|get_blast_radius|get_changed_symbols|get_context_bundle|get_ranked_context|assemble_task_context|index_file|index_repo)";
const JDOCMUNCH_READ_OPERATION = "(?:search_sections|get_toc|get_toc_tree|get_section|get_sections|get_document_outline)";
const APPROVED_PROVIDER_READ_TOOL = new RegExp(
  `^(?:${CAPSULES_READ_OPERATION}|ctx_${CONTEXT_MODE_READ_OPERATION}|context[-_]?mode_(?:ctx_)?${CONTEXT_MODE_READ_OPERATION}|jcodemunch_${JCODEMUNCH_READ_OPERATION}|mcp__(?:context[-_]?mode)__(?:ctx_)?${CONTEXT_MODE_READ_OPERATION}|mcp__jcodemunch__(?:jcodemunch_)?${JCODEMUNCH_READ_OPERATION}|mcp:(?:context[-_]?mode)[:/](?:ctx_)?${CONTEXT_MODE_READ_OPERATION}|mcp:jcodemunch[:/](?:jcodemunch_)?${JCODEMUNCH_READ_OPERATION}|jdocmunch_${JDOCMUNCH_READ_OPERATION}|mcp__jdocmunch__(?:jdocmunch_)?${JDOCMUNCH_READ_OPERATION}|mcp:jdocmunch[:/](?:jdocmunch_)?${JDOCMUNCH_READ_OPERATION})$`,
  "i",
);
// context-mode execute tools run caller-supplied code, so they are gated by input rather than by name:
// shell code and batch commands pass the read-only `bash` gate for every role; JS/TS analysis code must stay
// inside a static capability screen and may only read files inside the assigned repository.
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

function repositoryRoot(workspace: string): string {
  const workspacePath = canonicalPath(workspace) ?? resolve(workspace);
  let current = workspacePath;
  while (true) {
    // A worktree or submodule has a .git file rather than a directory.
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return workspacePath; // Non-git workspace: retain its original boundary.
    current = parent;
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

function isInsideRepository(workspace: string, candidate: string): boolean {
  return isInsideWorkspace(repositoryRoot(workspace), isAbsolute(candidate) ? candidate : resolve(workspace, candidate));
}

function workspaceRelativePath(workspace: string, candidate: string): string {
  const workspacePath = canonicalPath(workspace) ?? resolve(workspace);
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(workspace, candidate);
  const candidatePath = canonicalPath(absolute) ?? absolute;
  const rel = relative(workspacePath, candidatePath).replaceAll("\\", "/");
  return rel === "" ? "." : rel;
}

function isPersonaPackageRoot(root: string): boolean {
  try {
    return (JSON.parse(nodeFs.readFileSync(join(root, "package.json"), "utf8")) as { name?: unknown }).name === "pi-persona-teams";
  } catch {
    return false;
  }
}

// Attestations are protected in every repository; the persona and enforcement
// sources (agents/, extensions/, package manifests) only exist to protect in
// the pi-persona-teams package itself, not in product repositories.
function isProtectedPath(workspace: string, candidate: string): boolean {
  const normalized = workspaceRelativePath(workspace, candidate);
  if (/^\.pi-persona\/attestations(?:\/|$)/.test(normalized)) return true;
  return isPersonaPackageRoot(repositoryRoot(workspace))
    && /^(?:\.pi-persona|agents|extensions)(?:\/|$)|^(?:package\.json|tsconfig\.json)$/.test(normalized);
}

// Exact current text is needed before an edit. Keep this exception narrower than
// general code exploration: one bounded source-file range in the writable workspace.
export function isBoundedEditableSourceRead(workspace: string, input: Record<string, unknown>): boolean {
  const { path, offset, limit } = input;
  return typeof path === "string" && /\.(?:c|cc|cpp|cs|go|java|js|jsx|mjs|py|rb|rs|swift|ts|tsx|vue|svelte)$/i.test(path)
    && Number.isInteger(offset) && (offset as number) >= 1
    && Number.isInteger(limit) && (limit as number) >= 1 && (limit as number) <= 160
    && isInsideWorkspace(workspace, path) && !isProtectedPath(workspace, path);
}

function isHostAssignedOutput(workspace: string, candidate: string, assigned: string): boolean {
  const candidatePath = canonicalPath(isAbsolute(candidate) ? resolve(candidate) : resolve(workspace, candidate));
  const assignedPath = canonicalPath(assigned);
  return Boolean(candidatePath && assignedPath && candidatePath === assignedPath);
}

function isPlanningArtifact(workspace: string, candidate: string): boolean {
  const normalized = workspaceRelativePath(workspace, candidate);
  return /^(?:plans|docs\/plans|docs\/testing|docs\/reviews)(?:\/|$)/.test(normalized);
}

/**
 * Splits on unquoted `;`, newlines, `&&`, and `||`. Returns undefined for
 * unbalanced quotes or a lone `&` (background job).
 */
function commandSequence(command: string): string[] | undefined {
  const parts: string[] = [];
  let quote: string | undefined;
  let current = "";
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote) {
      if (char === quote) quote = undefined;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === ";" || char === "\n") { parts.push(current.trim()); current = ""; continue; }
    else if ((char === "&" || char === "|") && command[i + 1] === char) { parts.push(current.trim()); current = ""; i += 1; continue; }
    else if (char === "&") return undefined;
    current += char;
  }
  if (quote) return undefined;
  // A single trailing `;` or newline is harmless; empty commands elsewhere (`;;`) are rejected by callers.
  if (current.trim() || parts.length === 0) parts.push(current.trim());
  return parts;
}

/** Splits on unquoted `|`; returns undefined when quotes are unbalanced. */
function pipelineStages(command: string): string[] | undefined {
  const stages: string[] = [];
  let quote: string | undefined;
  let current = "";
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "|") {
      stages.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (quote) return undefined;
  stages.push(current.trim());
  return stages;
}

function commandAllowedForReadOnly(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (SHELL_CONTROL_SYNTAX.test(trimmed)) {
    if (SHELL_UNSAFE_SYNTAX.test(trimmed)) return false;
    const parts = commandSequence(trimmed);
    if (!parts || parts.some((part) => !part)) return false;
    if (parts.length > 1) return parts.length <= MAX_SEQUENCE_COMMANDS && parts.every(commandAllowedForReadOnly);
    const stages = pipelineStages(trimmed);
    if (!stages || stages.length < 2 || stages.some((stage) => !stage)) return false;
    const [first, ...filters] = stages;
    return !first.includes("|") && commandAllowedForReadOnly(first) && filters.every((filter) => PIPE_FILTER.some((pattern) => pattern.test(filter)));
  }
  if (/^git\s+branch(?:\s|$)/i.test(trimmed)) return GIT_BRANCH_LIST.test(trimmed);
  if (GIT_EXTERNAL_PROGRAM.test(trimmed) || RG_EXTERNAL_PROGRAM.test(trimmed)) return false;
  if (/^find(?:\s|$)/i.test(trimmed) && FIND_UNSAFE_ACTION.test(trimmed)) return false;
  if (OCTOCODE_READ_COMMAND.test(trimmed)) return true;
  if (RUST_VALIDATION_COMMAND.test(trimmed)) return true;
  if (CARGO_COMMAND.test(trimmed)) return !CARGO_RELEASE_OPERATION.test(trimmed) && !CARGO_SOURCE_MUTATION.test(trimmed);
  if (MUTATING_COMMAND.test(trimmed)) return false;
  if (SHELL_INTERPRETER.test(trimmed) && !/^node\s+--version(?:\s|$)/i.test(trimmed)) return false;
  return READ_ONLY_COMMANDS.test(trimmed);
}

function commandAllowedForImplementation(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (SHELL_CONTROL_SYNTAX.test(trimmed)) {
    const parts = SHELL_UNSAFE_SYNTAX.test(trimmed) ? undefined : commandSequence(trimmed);
    if (parts && parts.length > 1) return parts.length <= MAX_SEQUENCE_COMMANDS && parts.every((part) => Boolean(part) && commandAllowedForImplementation(part));
    return commandAllowedForReadOnly(trimmed);
  }
  if (CARGO_COMMAND.test(trimmed)) return !CARGO_RELEASE_OPERATION.test(trimmed);
  return commandAllowedForReadOnly(trimmed);
}

// context-mode shell runs outside the persona's bash hook, so every role gets the read-only command gate here.
function evaluateContextModeExecute(operation: string, input: Record<string, unknown>, workspace: string): { allowed: boolean; reason: string } {
  if (input.cwd !== undefined && (typeof input.cwd !== "string" || !isInsideRepository(workspace, input.cwd))) {
    return { allowed: false, reason: "context-mode cwd must stay inside the assigned repository" };
  }

  if (operation === "batch_execute") {
    const commands = input.commands;
    if (!Array.isArray(commands) || commands.length < 1 || commands.length > 8) return { allowed: false, reason: "context-mode batch needs 1-8 {label, command} entries" };
    for (const entry of commands as unknown[]) {
      const { label, command } = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
      if (typeof label !== "string" || label.trim() === "" || typeof command !== "string" || !commandAllowedForReadOnly(command)) {
        return { allowed: false, reason: `batch commands must be bounded read-only operations in the assigned workspace (${READ_ONLY_SHELL_GUIDANCE}): ${String(command).slice(0, 80)}` };
      }
    }
    return { allowed: true, reason: "bounded read-only batch in assigned workspace" };
  }

  if (operation === "execute_file") {
    const path = input.path;
    if (typeof path !== "string" || path.trim() === "" || !isInsideRepository(workspace, path)) {
      return { allowed: false, reason: "context-mode execute_file path must be explicit and inside the assigned repository; ask the parent to place external handoff inputs inside the checkout rather than /tmp" };
    }
  }

  const language = typeof input.language === "string" ? input.language.trim() : "";
  const code = typeof input.code === "string" ? input.code : "";
  if (!code.trim()) return { allowed: false, reason: "context-mode execute requires explicit code" };
  if (SHELL_LANGUAGE.test(language)) {
    return commandAllowedForReadOnly(code)
      ? { allowed: true, reason: "context-mode shell code within the role's shell boundary" }
      : { allowed: false, reason: `context-mode shell code is outside this role's shell boundary; ${READ_ONLY_SHELL_GUIDANCE}` };
  }
  if (!ANALYSIS_LANGUAGE.test(language)) return { allowed: false, reason: "context-mode execute is limited to javascript/typescript analysis or bounded shell commands" };
  const unsafe = code.match(UNSAFE_ANALYSIS_CODE)?.[0];
  if (unsafe) return { allowed: false, reason: `context-mode analysis code may only transform provided data; disallowed capability: ${unsafe.slice(0, 40)}. Read a file with ctx_execute_file (FILE_CONTENT) or list/inspect with bounded read-only shell commands instead` };
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
  options: { skipMethodGate?: boolean; assignedOutputPath?: string; attestationDir?: string } = {},
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
    const decision = evaluateContextModeExecute(executeOperation, input, workspace);
    recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: summarizeInput(input), action: decision.allowed ? "allowed" : "blocked", reason: decision.reason });
    return { ...decision, substantive };
  }
  if (tool.toolName === "intercom" && input.action === "list-cwd") {
    const allowed = input.cwd === undefined || (typeof input.cwd === "string" && isInsideRepository(workspace, input.cwd));
    const reason = allowed ? "repository-scoped session discovery" : "session discovery must stay inside the assigned repository";
    recordPolicyEvent(ledger, { toolName: tool.toolName, action: allowed ? "allowed" : "blocked", reason });
    return { allowed, reason, substantive };
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
    if (options.attestationDir && candidatePaths?.some((candidate) => isInsideWorkspace(options.attestationDir!, isAbsolute(candidate) ? candidate : resolve(workspace, candidate)))) {
      const reason = "persona attestations are written only by the persona runtime";
      recordPolicyEvent(ledger, { toolName: tool.toolName, action: "blocked", reason });
      return { allowed: false, reason, substantive };
    }
    if (options.assignedOutputPath && candidatePaths?.length === 1 && isHostAssignedOutput(workspace, candidatePaths[0], options.assignedOutputPath)) {
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: candidatePaths[0].slice(0, 160), action: "allowed", reason: "host-assigned subagent output path" });
      return { allowed: true, reason: "host-assigned subagent output path", substantive };
    }
    if (!candidatePaths || candidatePaths.some((candidate) => !isInsideRepository(workspace, candidate))) {
      const reason = "every write path must be explicit and inside the assigned repository (or be this run's host-assigned subagent output path); an external report/output path must be reassigned to an in-repository path";
      recordPolicyEvent(ledger, { toolName: tool.toolName, action: "blocked", reason });
      return { allowed: false, reason, substantive };
    }
    const inputSummary = candidatePaths.join(", ").slice(0, 160);
    if (authority === "implementation-writer") {
      if (candidatePaths.some((candidate) => isProtectedPath(workspace, candidate) || isProtectedPath(repositoryRoot(workspace), candidate))) {
        const reason = "persona and enforcement files are protected during a product implementation";
        recordPolicyEvent(ledger, { toolName: tool.toolName, action: "blocked", inputSummary, reason });
        return { allowed: false, reason, substantive };
      }
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary, action: "allowed", reason: "assigned implementation workspace" });
      return { allowed: true, reason: "assigned implementation workspace", substantive };
    }
    if (["planning-read-only", "strategy-read-only", "independent-review-read-only", "release-prepare", "retrospective-read-only"].includes(authority) && candidatePaths.every((candidate) => isPlanningArtifact(workspace, candidate) || isPlanningArtifact(repositoryRoot(workspace), candidate))) {
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
        const reason = `implementation shell access is limited to approved validation and read-only commands; ${READ_ONLY_SHELL_GUIDANCE}`;
        recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: command.slice(0, 160), action: "blocked", reason });
        return { allowed: false, reason, substantive };
      }
      recordPolicyEvent(ledger, { toolName: tool.toolName, inputSummary: command.slice(0, 160), action: "allowed", reason: "implementation validation boundary" });
      return { allowed: true, reason: "implementation validation boundary", substantive };
    }
    if (!commandAllowedForReadOnly(command)) {
      const reason = `shell command is not on this read-only role's allowlist or may mutate state; ${READ_ONLY_SHELL_GUIDANCE}`;
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
