/**
 * Core interfaces for agentic tools that LLM can invoke.
 */

import type { LLMToolDefinition } from "../providers/tool-types.js";
import type { Policy } from "../schemas/config.schema.js";

/** Context passed to every tool execution */
export interface ToolExecutionContext {
  /** Working directory for relative paths */
  cwd: string;
  /** If set, file operations are restricted to these glob patterns */
  allowedPaths?: string[];
  /** Paths that must not be written to (from policy) */
  protectedPaths?: string[];
  /** Policy config for budget checks etc. */
  policy?: Policy;
  /** Confirmation callback for destructive operations */
  confirm?: (msg: string) => Promise<boolean>;
}

/** Result returned from a tool execution */
export interface ToolExecutionResult {
  /** Text content returned to the LLM */
  content: string;
  /** Whether the execution resulted in an error */
  is_error: boolean;
  /** Optional metadata for evidence tracking */
  metadata?: {
    files_read?: string[];
    files_written?: string[];
    commands_run?: string[];
  };
}

/** An agentic tool that LLM can discover and invoke */
export interface AgenticTool {
  /** Tool definition sent to LLM (name, description, input_schema) */
  definition: LLMToolDefinition;
  /** Execute the tool with given input */
  execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult>;
}
