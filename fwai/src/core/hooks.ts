/**
 * Pre/Post tool use hooks — allow policies to veto or observe tool executions.
 */

export type HookDecision = "allow" | "deny" | "ask_user";

export interface PreToolUseHook {
  /** Glob pattern or exact name to match tool names */
  pattern: string;
  /** Decision when matched */
  decision: HookDecision;
  /** Optional reason shown when denying or asking */
  reason?: string;
}

export interface PostToolUseHook {
  /** Glob pattern or exact name to match tool names */
  pattern: string;
  /** Callback invoked after tool execution */
  onComplete: (toolName: string, result: string, isError: boolean) => void;
}

export interface HooksConfig {
  pre_tool_use?: PreToolUseHook[];
  post_tool_use?: PostToolUseHook[];
}

/**
 * Evaluate pre-tool-use hooks for a given tool name.
 * Returns the decision from the first matching hook, or "allow" if none match.
 */
export function evaluatePreToolHooks(
  toolName: string,
  hooks: PreToolUseHook[]
): { decision: HookDecision; reason?: string } {
  for (const hook of hooks) {
    if (matchesPattern(toolName, hook.pattern)) {
      return { decision: hook.decision, reason: hook.reason };
    }
  }
  return { decision: "allow" };
}

/**
 * Run post-tool-use hooks for a given tool name.
 */
export function runPostToolHooks(
  toolName: string,
  result: string,
  isError: boolean,
  hooks: PostToolUseHook[]
): void {
  for (const hook of hooks) {
    if (matchesPattern(toolName, hook.pattern)) {
      try {
        hook.onComplete(toolName, result, isError);
      } catch {
        // Hooks should not break the main flow
      }
    }
  }
}

/** Simple pattern matching: exact match or glob-style wildcards */
function matchesPattern(name: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern === name) return true;
  // Simple prefix wildcard: "bash*" matches "bash", "bash_safe"
  if (pattern.endsWith("*") && name.startsWith(pattern.slice(0, -1))) return true;
  // Simple suffix wildcard: "*file" matches "read_file", "write_file"
  if (pattern.startsWith("*") && name.endsWith(pattern.slice(1))) return true;
  return false;
}
