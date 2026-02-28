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
  StreamCallbacks,
} from "./tool-types.js";
import { ProviderError } from "../utils/errors.js";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic | null = null;
  private model = "";
  private maxTokens = 4096;
  private temperature = 0.2;
  private ready = false;
  private initError?: string;

  async init(config: ProviderInitConfig): Promise<void> {
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;

    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      this.initError = `Environment variable ${config.apiKeyEnv} is not set`;
      return;
    }

    this.client = new Anthropic({ apiKey });
    this.ready = true;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (!this.client)
      throw new ProviderError("Anthropic provider not initialized", undefined, "anthropic");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.max_tokens ?? this.maxTokens,
      temperature: request.temperature ?? this.temperature,
      system: request.system,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

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

  async completeWithTools(request: ToolCompletionRequest): Promise<ToolCompletionResponse> {
    if (!this.client)
      throw new ProviderError("Anthropic provider not initialized", undefined, "anthropic");

    // Map ToolMessage[] to Anthropic SDK message format
    const messages = request.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: typeof m.content === "string" ? m.content : mapContentBlocksToSDK(m.content),
    }));

    // Map tool definitions to Anthropic SDK format
    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool["input_schema"],
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.max_tokens ?? this.maxTokens,
      temperature: request.temperature ?? this.temperature,
      system: request.system,
      messages,
      tools,
    });

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
      stop_reason: response.stop_reason as ToolCompletionResponse["stop_reason"],
    };
  }

  async completeWithToolsStreaming(
    request: ToolCompletionRequest,
    callbacks: StreamCallbacks
  ): Promise<ToolCompletionResponse> {
    if (!this.client)
      throw new ProviderError("Anthropic provider not initialized", undefined, "anthropic");

    const messages = request.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: typeof m.content === "string" ? m.content : mapContentBlocksToSDK(m.content),
    }));

    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool["input_schema"],
    }));

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: request.max_tokens ?? this.maxTokens,
      temperature: request.temperature ?? this.temperature,
      system: request.system,
      messages,
      tools,
    });

    // Stream text deltas to callback
    stream.on("text", (textDelta) => {
      callbacks.onTextDelta?.(textDelta);
    });

    // Notify when a tool_use content block completes
    stream.on("contentBlock", (block) => {
      if (block.type === "tool_use") {
        callbacks.onToolUseStart?.(block.id, block.name);
      }
    });

    // Wait for stream to finish and get the final message
    const finalMessage = await stream.finalMessage();

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
      stop_reason: finalMessage.stop_reason as ToolCompletionResponse["stop_reason"],
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

/** Map our ContentBlock[] to Anthropic SDK message content */
function mapContentBlocksToSDK(blocks: ContentBlock[]): Anthropic.MessageParam["content"] {
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
