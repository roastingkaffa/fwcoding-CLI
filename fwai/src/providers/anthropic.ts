import Anthropic from "@anthropic-ai/sdk";
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
  ToolMessage,
  StreamCallbacks,
} from "./tool-types.js";
import { withRetry } from "../utils/retry.js";
import type { RetryConfig } from "../utils/retry.js";
import { ProviderError } from "../errors/provider-error.js";
import * as log from "../utils/logger.js";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic | null = null;
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

    this.client = new Anthropic({ apiKey });
    this.ready = true;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (!this.client) throw new Error("Anthropic provider not initialized");

    const response = await withRetry(
      () =>
        this.client!.messages.create({
          model: this.model,
          max_tokens: request.max_tokens ?? this.maxTokens,
          temperature: request.temperature ?? this.temperature,
          system: request.system,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      (err) => {
        const pe = toProviderError(err, "anthropic");
        if (!pe.isRetryable) throw pe;
        return true;
      },
      this.retryConfig,
      (attempt, delay) =>
        log.warn(`Anthropic API retry ${attempt} in ${delay}ms...`),
    );

    const textBlock = response.content.find((b) => b.type === "text");
    return {
      content: textBlock ? textBlock.text : "",
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      stop_reason: response.stop_reason ?? "end_turn",
    };
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async completeWithTools(
    request: ToolCompletionRequest,
  ): Promise<ToolCompletionResponse> {
    if (!this.client) throw new Error("Anthropic provider not initialized");

    // Map ToolMessage[] to Anthropic SDK message format
    const messages = request.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content:
        typeof m.content === "string"
          ? m.content
          : mapContentBlocksToSDK(m.content),
    }));

    // Map tool definitions to Anthropic SDK format
    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool["input_schema"],
    }));

    const response = await withRetry(
      () =>
        this.client!.messages.create({
          model: this.model,
          max_tokens: request.max_tokens ?? this.maxTokens,
          temperature: request.temperature ?? this.temperature,
          system: request.system,
          messages,
          tools,
        }),
      (err) => {
        const pe = toProviderError(err, "anthropic");
        if (!pe.isRetryable) throw pe;
        return true;
      },
      this.retryConfig,
      (attempt, delay) =>
        log.warn(`Anthropic API retry ${attempt} in ${delay}ms...`),
    );

    // Map Anthropic SDK response content to our ContentBlock type
    // Filter out thinking/redacted_thinking blocks which are not part of our protocol
    const content: ContentBlock[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        content.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
      // Skip thinking/redacted_thinking blocks
    }

    return {
      content,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      stop_reason:
        response.stop_reason as ToolCompletionResponse["stop_reason"],
    };
  }

  async completeWithToolsStreaming(
    request: ToolCompletionRequest,
    callbacks: StreamCallbacks,
  ): Promise<ToolCompletionResponse> {
    if (!this.client) throw new Error("Anthropic provider not initialized");

    const messages = request.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content:
        typeof m.content === "string"
          ? m.content
          : mapContentBlocksToSDK(m.content),
    }));

    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool["input_schema"],
    }));

    // Wrap entire stream+finalMessage in withRetry — rate limit errors
    // surface from stream.finalMessage(), not from stream setup.
    const finalMessage = await withRetry(
      async () => {
        const stream = this.client!.messages.stream({
          model: this.model,
          max_tokens: request.max_tokens ?? this.maxTokens,
          temperature: request.temperature ?? this.temperature,
          system: request.system,
          messages,
          tools,
        });

        stream.on("text", (textDelta) => {
          callbacks.onTextDelta?.(textDelta);
        });

        stream.on("contentBlock", (block) => {
          if (block.type === "tool_use") {
            callbacks.onToolUseStart?.(block.id, block.name);
          }
        });

        return await stream.finalMessage();
      },
      (err) => {
        const pe = toProviderError(err, "anthropic");
        if (!pe.isRetryable) throw pe;
        return true;
      },
      this.retryConfig,
      (attempt, delay) =>
        log.warn(`Anthropic API streaming retry ${attempt} in ${delay}ms...`),
    );

    // Map final message content to our ContentBlock type
    const content: ContentBlock[] = [];
    for (const block of finalMessage.content) {
      if (block.type === "text") {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        content.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content,
      usage: {
        input_tokens: finalMessage.usage.input_tokens,
        output_tokens: finalMessage.usage.output_tokens,
      },
      stop_reason:
        finalMessage.stop_reason as ToolCompletionResponse["stop_reason"],
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

function toProviderError(err: unknown, provider: string): ProviderError {
  if (err instanceof ProviderError) return err;
  // Anthropic SDK throws APIError with .status
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    const message = err instanceof Error ? err.message : String(err);
    return new ProviderError(message, status, provider);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderError(message, undefined, provider);
}

/** Map our ContentBlock[] to Anthropic SDK message content */
function mapContentBlocksToSDK(
  blocks: ContentBlock[],
): Anthropic.MessageParam["content"] {
  return blocks.map((block) => {
    switch (block.type) {
      case "text":
        return { type: "text" as const, text: block.text };
      case "tool_use":
        return {
          type: "tool_use" as const,
          id: block.id,
          name: block.name,
          input: block.input,
        };
      case "tool_result":
        return {
          type: "tool_result" as const,
          tool_use_id: block.tool_use_id,
          content: block.content,
          is_error: block.is_error,
        };
    }
  }) as Anthropic.MessageParam["content"];
}
