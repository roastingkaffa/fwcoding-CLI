/**
 * Tool-calling types for LLM providers that support Anthropic-style tool use.
 */

// ── Tool Definition ──────────────────────────────────────────────────

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>; // JSON Schema
}

// ── Content Blocks ───────────────────────────────────────────────────

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// ── Messages ─────────────────────────────────────────────────────────

export interface ToolMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

// ── Request / Response ───────────────────────────────────────────────

export interface ToolCompletionRequest {
  messages: ToolMessage[];
  system?: string;
  tools?: LLMToolDefinition[];
  max_tokens?: number;
  temperature?: number;
}

export interface ToolCompletionResponse {
  content: ContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: "end_turn" | "tool_use" | "max_tokens";
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Extract all text from an array of content blocks */
export function extractText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Extract all tool_use blocks from an array of content blocks */
export function extractToolUseBlocks(blocks: ContentBlock[]): ToolUseBlock[] {
  return blocks.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

/** Create a text block */
export function textBlock(text: string): TextBlock {
  return { type: "text", text };
}

/** Callbacks for streaming tool completions */
export interface StreamCallbacks {
  onTextDelta?: (text: string) => void;
  onToolUseStart?: (id: string, name: string) => void;
  onToolUseInput?: (id: string, inputDelta: string) => void;
}

/** Create a tool result block */
export function toolResultBlock(
  toolUseId: string,
  content: string,
  isError = false
): ToolResultBlock {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
    is_error: isError || undefined,
  };
}
