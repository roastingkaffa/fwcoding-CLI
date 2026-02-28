import OpenAI from "openai";
import type {
  LLMProvider,
  ProviderInitConfig,
  ProviderStatus,
  CompletionRequest,
  CompletionResponse,
} from "./provider.js";
import type {
  ToolCompletionRequest,
  ToolCompletionResponse,
  ContentBlock,
  LLMToolDefinition,
  StreamCallbacks,
} from "./tool-types.js";
import { withRetry } from "../utils/retry.js";
import type { RetryConfig } from "../utils/retry.js";
import { ProviderError } from "../errors/provider-error.js";
import * as log from "../utils/logger.js";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private client: OpenAI | null = null;
  private model = "";
  private maxTokens = 4096;
  private temperature = 0.2;
  private ready = false;
  private initError?: string;
  private retryConfig?: Partial<RetryConfig>;

  async init(config: ProviderInitConfig): Promise<void> {
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;

    if (config.retry) {
      this.retryConfig = {
        maxAttempts: config.retry.max_attempts,
        initialDelayMs: config.retry.initial_delay_ms,
        maxDelayMs: config.retry.max_delay_ms,
        backoffMultiplier: config.retry.backoff_multiplier,
      };
    }

    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      this.initError = `Environment variable ${config.apiKeyEnv} is not set`;
      return;
    }

    this.client = new OpenAI({ apiKey });
    this.ready = true;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (!this.client) throw new Error("OpenAI provider not initialized");

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (request.system) {
      messages.push({ role: "system", content: request.system });
    }
    for (const m of request.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    const response = await withRetry(
      () =>
        this.client!.chat.completions.create({
          model: this.model,
          max_tokens: request.max_tokens ?? this.maxTokens,
          temperature: request.temperature ?? this.temperature,
          messages,
        }),
      (err) => {
        const pe = toProviderError(err, "openai");
        if (!pe.isRetryable) throw pe;
        return true;
      },
      this.retryConfig,
      (attempt, delay) => log.warn(`OpenAI API retry ${attempt} in ${delay}ms...`)
    );

    const choice = response.choices[0];
    return {
      content: choice?.message?.content ?? "",
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      },
      stop_reason: choice?.finish_reason ?? "stop",
    };
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async completeWithTools(request: ToolCompletionRequest): Promise<ToolCompletionResponse> {
    if (!this.client) throw new Error("OpenAI provider not initialized");

    const messages = mapMessagesToOpenAI(request.messages, request.system);
    const tools = request.tools ? mapToolDefsToOpenAI(request.tools) : undefined;

    const response = await withRetry(
      () =>
        this.client!.chat.completions.create({
          model: this.model,
          max_tokens: request.max_tokens ?? this.maxTokens,
          temperature: request.temperature ?? this.temperature,
          messages,
          tools,
        }),
      (err) => {
        const pe = toProviderError(err, "openai");
        if (!pe.isRetryable) throw pe;
        return true;
      },
      this.retryConfig,
      (attempt, delay) => log.warn(`OpenAI API retry ${attempt} in ${delay}ms...`)
    );

    return mapOpenAIResponseToToolResponse(response);
  }

  async completeWithToolsStreaming(
    request: ToolCompletionRequest,
    callbacks: StreamCallbacks
  ): Promise<ToolCompletionResponse> {
    if (!this.client) throw new Error("OpenAI provider not initialized");

    const messages = mapMessagesToOpenAI(request.messages, request.system);
    const tools = request.tools ? mapToolDefsToOpenAI(request.tools) : undefined;

    const stream = await withRetry(
      () =>
        this.client!.chat.completions.create({
          model: this.model,
          max_tokens: request.max_tokens ?? this.maxTokens,
          temperature: request.temperature ?? this.temperature,
          messages,
          tools,
          stream: true,
        }),
      (err) => {
        const pe = toProviderError(err, "openai");
        if (!pe.isRetryable) throw pe;
        return true;
      },
      this.retryConfig,
      (attempt, delay) => log.warn(`OpenAI API streaming retry ${attempt} in ${delay}ms...`)
    );

    // Accumulate streamed chunks into a final response
    let finishReason = "";
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
    let contentText = "";

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          contentText += delta.content;
          callbacks.onTextDelta?.(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCalls.has(tc.index)) {
              toolCalls.set(tc.index, {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                arguments: "",
              });
              if (tc.id && tc.function?.name) {
                callbacks.onToolUseStart?.(tc.id, tc.function.name);
              }
            }
            const entry = toolCalls.get(tc.index)!;
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (tc.function?.arguments) {
              entry.arguments += tc.function.arguments;
              callbacks.onToolUseInput?.(entry.id, tc.function.arguments);
            }
          }
        }

        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks.onError?.(error);
      throw err;
    }

    // Build content blocks
    const content: ContentBlock[] = [];
    if (contentText) {
      content.push({ type: "text", text: contentText });
    }
    for (const [, tc] of toolCalls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.arguments || "{}");
      } catch {
        input = { _raw: tc.arguments };
      }
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input,
      });
    }

    const stopReason = mapFinishReason(finishReason);

    return {
      content,
      usage: { input_tokens: 0, output_tokens: 0 }, // Stream doesn't provide usage
      stop_reason: stopReason,
    };
  }

  isReady(): boolean {
    return this.ready;
  }

  status(): ProviderStatus {
    return {
      name: this.name,
      ready: this.ready,
      model: this.model,
      error: this.initError,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function toProviderError(err: unknown, provider: string): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    const message = err instanceof Error ? err.message : String(err);
    return new ProviderError(message, status, provider);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderError(message, undefined, provider);
}

/** Map fwai tool definitions to OpenAI function-calling format */
function mapToolDefsToOpenAI(tools: LLMToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

/** Map fwai ToolMessage[] to OpenAI message format */
function mapMessagesToOpenAI(
  messages: import("./tool-types.js").ToolMessage[],
  system?: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
    } else {
      // Content blocks
      if (msg.role === "assistant") {
        // Check for tool_use blocks → OpenAI tool_calls
        const textParts = msg.content
          .filter((b): b is import("./tool-types.js").TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        const toolUses = msg.content.filter(
          (b): b is import("./tool-types.js").ToolUseBlock => b.type === "tool_use"
        );

        const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: textParts || null,
        };

        if (toolUses.length > 0) {
          assistantMsg.tool_calls = toolUses.map((tu) => ({
            id: tu.id,
            type: "function" as const,
            function: {
              name: tu.name,
              arguments: JSON.stringify(tu.input),
            },
          }));
        }

        result.push(assistantMsg);
      } else {
        // User message with tool_result blocks
        const toolResults = msg.content.filter(
          (b): b is import("./tool-types.js").ToolResultBlock => b.type === "tool_result"
        );

        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            result.push({
              role: "tool",
              tool_call_id: tr.tool_use_id,
              content: tr.content,
            });
          }
        } else {
          const text = msg.content
            .filter((b): b is import("./tool-types.js").TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("");
          result.push({ role: "user", content: text });
        }
      }
    }
  }

  return result;
}

/** Map OpenAI non-streaming response to ToolCompletionResponse */
function mapOpenAIResponseToToolResponse(
  response: OpenAI.Chat.ChatCompletion
): ToolCompletionResponse {
  const choice = response.choices[0];
  const content: ContentBlock[] = [];

  if (choice?.message?.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice?.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch {
        input = { _raw: tc.function.arguments };
      }
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input,
      });
    }
  }

  return {
    content,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
    },
    stop_reason: mapFinishReason(choice?.finish_reason ?? "stop"),
  };
}

function mapFinishReason(reason: string): ToolCompletionResponse["stop_reason"] {
  if (reason === "tool_calls") return "tool_use";
  if (reason === "length") return "max_tokens";
  return "end_turn";
}
