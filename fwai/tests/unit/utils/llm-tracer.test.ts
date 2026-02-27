import { LLMTracer, LLMCallTimer, estimateCost } from "../../../src/utils/llm-tracer.js";

describe("LLMTracer", () => {
  let tracer: LLMTracer;

  beforeEach(() => {
    tracer = new LLMTracer();
  });

  it("configure sets provider and model", () => {
    tracer.configure("anthropic", "claude-sonnet-4-20250514");
    expect(tracer.getProvider()).toBe("anthropic");
    expect(tracer.getModel()).toBe("claude-sonnet-4-20250514");
  });

  it("record adds a call and getCalls returns copy", () => {
    tracer.configure("anthropic", "claude-sonnet-4-20250514");
    tracer.record({
      purpose: "test",
      model: "claude-sonnet-4-20250514",
      input_tokens: 100,
      output_tokens: 50,
      duration_ms: 200,
      timestamp: new Date().toISOString(),
    });

    const calls = tracer.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].purpose).toBe("test");
    expect(calls[0].input_tokens).toBe(100);

    // Verify it returns a copy
    calls.push({} as any);
    expect(tracer.getCalls()).toHaveLength(1);
  });

  it("accumulates token totals across multiple calls", () => {
    tracer.configure("anthropic", "claude-sonnet-4-20250514");
    tracer.record({
      purpose: "call1",
      model: "claude-sonnet-4-20250514",
      input_tokens: 100,
      output_tokens: 50,
      duration_ms: 200,
      timestamp: new Date().toISOString(),
    });
    tracer.record({
      purpose: "call2",
      model: "claude-sonnet-4-20250514",
      input_tokens: 200,
      output_tokens: 100,
      duration_ms: 300,
      timestamp: new Date().toISOString(),
    });

    expect(tracer.getTotalInputTokens()).toBe(300);
    expect(tracer.getTotalOutputTokens()).toBe(150);
  });

  it("reset clears all calls", () => {
    tracer.record({
      purpose: "test",
      model: "m",
      input_tokens: 10,
      output_tokens: 5,
      duration_ms: 1,
      timestamp: new Date().toISOString(),
    });
    expect(tracer.getCalls()).toHaveLength(1);
    tracer.reset();
    expect(tracer.getCalls()).toHaveLength(0);
  });

  it("getEstimatedCost uses configured model", () => {
    tracer.configure("anthropic", "claude-sonnet-4-20250514");
    tracer.record({
      purpose: "test",
      model: "claude-sonnet-4-20250514",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      duration_ms: 1000,
      timestamp: new Date().toISOString(),
    });
    // sonnet: 3.0 input + 15.0 output = $18.0 per 1M each
    const cost = tracer.getEstimatedCost();
    expect(cost).toBeDefined();
    expect(cost).toBeCloseTo(18.0, 1);
  });
});

describe("LLMCallTimer", () => {
  it("records call with timing on finish", () => {
    const tracer = new LLMTracer();
    tracer.configure("anthropic", "claude-sonnet-4-20250514");

    const timer = tracer.startCall("timer_test");
    timer.finish(50, 25, { extra: "data" });

    const calls = tracer.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].purpose).toBe("timer_test");
    expect(calls[0].model).toBe("claude-sonnet-4-20250514");
    expect(calls[0].input_tokens).toBe(50);
    expect(calls[0].output_tokens).toBe(25);
    expect(calls[0].duration_ms).toBeGreaterThanOrEqual(0);
    expect(calls[0].metadata).toEqual({ extra: "data" });
  });
});

describe("estimateCost", () => {
  it("returns cost for known models", () => {
    // Claude Sonnet: 3.0 in / 15.0 out per 1M
    const cost = estimateCost("claude-sonnet-4-20250514", 1000, 500);
    expect(cost).toBeDefined();
    expect(cost).toBeCloseTo((1000 * 3.0 + 500 * 15.0) / 1_000_000, 6);
  });

  it("returns undefined for unknown models", () => {
    expect(estimateCost("unknown-model-xyz", 100, 50)).toBeUndefined();
  });

  it("handles gpt-4o pricing", () => {
    // gpt-4o: 2.5 in / 10.0 out per 1M
    const cost = estimateCost("gpt-4o", 2000, 1000);
    expect(cost).toBeCloseTo((2000 * 2.5 + 1000 * 10.0) / 1_000_000, 6);
  });

  it("handles zero tokens", () => {
    const cost = estimateCost("claude-sonnet-4-20250514", 0, 0);
    expect(cost).toBe(0);
  });
});
