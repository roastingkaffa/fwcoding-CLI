import type { LLMCallRecord } from "../schemas/evidence.schema.js";

/** Per-token pricing in USD (per 1M tokens) */
interface ModelPricing {
  input: number; // cost per 1M input tokens
  output: number; // cost per 1M output tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-opus-4-20250514": { input: 15.0, output: 75.0 },
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
};

/** Estimate cost in USD from token counts and model */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  // Try exact match first, then prefix match
  let pricing = MODEL_PRICING[model];
  if (!pricing) {
    const key = Object.keys(MODEL_PRICING).find((k) => model.startsWith(k));
    if (key) pricing = MODEL_PRICING[key];
  }
  if (!pricing) return undefined;

  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

/** Accumulates LLM call records for the current run */
export class LLMTracer {
  private calls: LLMCallRecord[] = [];
  private provider = "";
  private model = "";

  configure(provider: string, model: string): void {
    this.provider = provider;
    this.model = model;
  }

  record(record: LLMCallRecord): void {
    this.calls.push(record);
  }

  /** Create a call record with timing */
  startCall(purpose: string): LLMCallTimer {
    return new LLMCallTimer(this, purpose, this.model);
  }

  getCalls(): LLMCallRecord[] {
    return [...this.calls];
  }

  getTotalInputTokens(): number {
    return this.calls.reduce((sum, c) => sum + c.input_tokens, 0);
  }

  getTotalOutputTokens(): number {
    return this.calls.reduce((sum, c) => sum + c.output_tokens, 0);
  }

  getEstimatedCost(): number | undefined {
    return estimateCost(this.model, this.getTotalInputTokens(), this.getTotalOutputTokens());
  }

  getProvider(): string {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }

  reset(): void {
    this.calls = [];
  }
}

export class LLMCallTimer {
  private startTime: number;

  constructor(
    private tracer: LLMTracer,
    private purpose: string,
    private model: string
  ) {
    this.startTime = Date.now();
  }

  finish(inputTokens: number, outputTokens: number, metadata?: Record<string, unknown>): void {
    this.tracer.record({
      purpose: this.purpose,
      model: this.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }
}

/** Singleton tracer for the current session */
export const globalTracer = new LLMTracer();
