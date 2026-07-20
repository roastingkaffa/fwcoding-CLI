/**
 * Core agentic loop engine.
 *
 * LLM sends tool_use → we execute tools → send results back → LLM decides next step
 * → repeat until done (end_turn) or maxIterations reached.
 *
 * This is a standalone function, callable from REPL, skill runner, or agent commands.
 */

import type { LLMProvider } from "../providers/provider.js";
import type { ToolMessage, ToolResultBlock } from "../providers/tool-types.js";
import { extractText, extractToolUseBlocks, toolResultBlock } from "../providers/tool-types.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolExecutionContext } from "../tools/tool-interface.js";
import { globalTracer } from "../utils/llm-tracer.js";
import { ProviderError } from "../utils/errors.js";
import { shouldCompress, compressConversation } from "./context-manager.js";

// ── Config & Result types ────────────────────────────────────────────

export interface AgenticLoopConfig {
  provider: LLMProvider;
  registry: ToolRegistry;
  systemPrompt: string;
  context: ToolExecutionContext;
  maxIterations?: number; // Default 50
  maxTokens?: number;
  temperature?: number;
  streaming?: boolean; // Use streaming API if available
  maxContinuations?: number; // Auto-continue on max_tokens truncation (default 2)
  onToolCall?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string, isError: boolean) => void;
  onTextOutput?: (text: string) => void;
  onTextDelta?: (delta: string) => void;
}

export interface AgenticToolCall {
  tool_name: string;
  input: Record<string, unknown>;
  output: string;
  is_error: boolean;
  duration_ms: number;
}

export interface AgenticLoopResult {
  messages: ToolMessage[]; // Full conversation (including tool calls)
  finalText: string;
  toolCallCount: number;
  iterations: number;
  agenticCalls: AgenticToolCall[];
  filesRead: string[];
  filesWritten: string[];
}

// ── Main loop ────────────────────────────────────────────────────────

export async function runAgenticLoop(
  userMessage: string,
  conversationHistory: ToolMessage[],
  config: AgenticLoopConfig
): Promise<AgenticLoopResult> {
  const maxIterations = config.maxIterations ?? 50;
  const maxContinuations = config.maxContinuations ?? 2;
  const provider = config.provider;
  const registry = config.registry;
  const toolDefs = registry.getDefinitions();

  // Track accumulated data
  const agenticCalls: AgenticToolCall[] = [];
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  let totalToolCalls = 0;
  let finalText = "";
  let continuationCount = 0;
  let iterationsRun = 0;

  // Append user message to conversation
  const messages: ToolMessage[] = [...conversationHistory, { role: "user", content: userMessage }];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    iterationsRun = iteration + 1;
    // Context window management: compress if approaching token limit
    const maxContextTokens = config.maxTokens ?? 4096;
    if (shouldCompress(messages, maxContextTokens * 25)) {
      const compressed = await compressConversation(messages, provider, {
        maxContextTokens: maxContextTokens * 25,
      });
      messages.length = 0;
      messages.push(...compressed);
    }

    // Call LLM with tools (streaming or non-streaming)
    const timer = globalTracer.startCall("agentic_loop");

    if (!provider.completeWithTools) {
      throw new ProviderError("Provider does not support tool calling", undefined, provider.name);
    }

    const request = {
      messages,
      system: config.systemPrompt,
      tools: toolDefs,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    };

    let response;
    const useStreaming = config.streaming && provider.completeWithToolsStreaming;

    if (useStreaming && provider.completeWithToolsStreaming) {
      response = await provider.completeWithToolsStreaming(request, {
        onTextDelta: (delta) => config.onTextDelta?.(delta),
        onToolUseStart: (id, name) => config.onToolCall?.(name, {}),
      });
    } else {
      response = await provider.completeWithTools(request);
    }

    timer.finish(response.usage.input_tokens, response.usage.output_tokens, {
      iteration,
      stop_reason: response.stop_reason,
    });

    // Extract text blocks and show to user (for non-streaming, or as final text)
    const text = extractText(response.content);
    if (text) {
      finalText = text;
      // Only call onTextOutput for non-streaming (streaming already emitted deltas)
      if (!useStreaming) {
        config.onTextOutput?.(text);
      }
    }

    // Append assistant response to conversation
    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = extractToolUseBlocks(response.content);

    // If the model requested tools, we MUST answer every tool_use with a
    // tool_result to keep the conversation protocol valid — do this regardless
    // of stop_reason (a max_tokens-truncated turn can still carry tool_use).
    if (toolUseBlocks.length === 0) {
      // No tools requested — decide whether to finish or continue.
      if (response.stop_reason === "end_turn") {
        break;
      }
      if (response.stop_reason === "max_tokens" && continuationCount < maxContinuations) {
        continuationCount++;
        messages.push({ role: "user", content: "Please continue." });
        continue;
      }
      // refusal / stop_sequence / pause_turn / exhausted continuations:
      // nothing more to send. Exit with whatever text we have rather than
      // pushing an empty-content user message (which the API rejects).
      break;
    }

    // Reset continuation counter on tool_use (normal flow)
    continuationCount = 0;

    // Process tool_use blocks
    const toolResults: ToolResultBlock[] = [];

    for (const toolUse of toolUseBlocks) {
      totalToolCalls++;
      config.onToolCall?.(toolUse.name, toolUse.input);

      const startTime = Date.now();
      const result = await registry.execute(toolUse.name, toolUse.input, config.context);
      const durationMs = Date.now() - startTime;

      // Track for evidence
      agenticCalls.push({
        tool_name: toolUse.name,
        input: toolUse.input,
        output: result.content.slice(0, 500), // Truncate for evidence
        is_error: result.is_error,
        duration_ms: durationMs,
      });

      if (result.metadata?.files_read) {
        for (const f of result.metadata.files_read) filesRead.add(f);
      }
      if (result.metadata?.files_written) {
        for (const f of result.metadata.files_written) filesWritten.add(f);
      }

      config.onToolResult?.(toolUse.name, result.content, result.is_error);

      toolResults.push(toolResultBlock(toolUse.id, result.content, result.is_error));
    }

    // Append tool results as a user message (Anthropic protocol)
    messages.push({ role: "user", content: toolResults });
  }

  return {
    messages,
    finalText,
    toolCallCount: totalToolCalls,
    iterations: iterationsRun,
    agenticCalls,
    filesRead: Array.from(filesRead),
    filesWritten: Array.from(filesWritten),
  };
}
