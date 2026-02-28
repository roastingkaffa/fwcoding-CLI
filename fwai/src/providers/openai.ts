import OpenAI from "openai";
import type {
  LLMProvider,
  ProviderInitConfig,
  ProviderStatus,
  CompletionRequest,
  CompletionResponse,
} from "./provider.js";
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
      (attempt, delay) =>
        log.warn(`OpenAI API retry ${attempt} in ${delay}ms...`),
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
    return false;
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
  // OpenAI SDK throws APIError with .status
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    const message = err instanceof Error ? err.message : String(err);
    return new ProviderError(message, status, provider);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderError(message, undefined, provider);
}
