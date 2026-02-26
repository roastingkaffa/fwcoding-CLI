import OpenAI from "openai";
import type {
  LLMProvider,
  ProviderInitConfig,
  ProviderStatus,
  CompletionRequest,
  CompletionResponse,
} from "./provider.js";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private client: OpenAI | null = null;
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

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: request.max_tokens ?? this.maxTokens,
      temperature: request.temperature ?? this.temperature,
      messages,
    });

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
