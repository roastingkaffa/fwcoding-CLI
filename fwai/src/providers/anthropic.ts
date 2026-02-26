import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  ProviderInitConfig,
  ProviderStatus,
  CompletionRequest,
  CompletionResponse,
} from "./provider.js";

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
    if (!this.client) throw new Error("Anthropic provider not initialized");

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
