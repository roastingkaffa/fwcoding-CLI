import { runParallelAgents, type AgentTask, type OrchestratorConfig } from "../../../src/agents/orchestrator.js";
import type { LLMProvider } from "../../../src/providers/provider.js";
import type { ToolCompletionRequest, ToolCompletionResponse } from "../../../src/providers/tool-types.js";
import type { AgentConfig } from "../../../src/schemas/agent.schema.js";

function makeMockAgent(name: string): AgentConfig {
  return {
    name,
    description: `Mock ${name} agent`,
    model: "inherit",
    system_prompt: `You are ${name}`,
    allowed_paths: [],
    protected_paths: [],
    max_iterations: 5,
    temperature: 0.2,
  };
}

function makeMockProvider(delay = 10): LLMProvider {
  return {
    name: "mock",
    init: async () => {},
    complete: async () => ({ content: "", usage: { input_tokens: 0, output_tokens: 0 }, stop_reason: "end_turn" }),
    isReady: () => true,
    status: () => ({ name: "mock", ready: true, model: "mock-model" }),
    supportsToolCalling: () => true,
    completeWithTools: async (_req: ToolCompletionRequest): Promise<ToolCompletionResponse> => {
      await new Promise((r) => setTimeout(r, delay));
      return {
        content: [{ type: "text", text: "Done" }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
      };
    },
  };
}

describe("runParallelAgents", () => {
  it("runs multiple agents and returns all results", async () => {
    const tasks: AgentTask[] = [
      { label: "agent-1", goal: "Task one", agent: makeMockAgent("bsp") },
      { label: "agent-2", goal: "Task two", agent: makeMockAgent("driver") },
    ];

    const config: OrchestratorConfig = {
      provider: makeMockProvider(),
      projectCtx: {
        name: "test",
        mcu: "STM32",
        compiler: "gcc",
        build_system: "cmake",
      },
      cwd: "/tmp",
      concurrency: 2,
    };

    const results = await runParallelAgents(tasks, config);
    expect(results).toHaveLength(2);
    expect(results[0].label).toBe("agent-1");
    expect(results[1].label).toBe("agent-2");
    expect(results[0].result).toBeDefined();
    expect(results[1].result).toBeDefined();
    expect(results[0].error).toBeUndefined();
    expect(results[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("isolates errors between agents", async () => {
    // Create a provider that fails on second call
    let callCount = 0;
    const failingProvider: LLMProvider = {
      name: "mock",
      init: async () => {},
      complete: async () => ({ content: "", usage: { input_tokens: 0, output_tokens: 0 }, stop_reason: "end_turn" }),
      isReady: () => true,
      status: () => ({ name: "mock", ready: true, model: "mock-model" }),
      supportsToolCalling: () => true,
      completeWithTools: async (): Promise<ToolCompletionResponse> => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Provider error");
        }
        return {
          content: [{ type: "text", text: "Success" }],
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: "end_turn",
        };
      },
    };

    const tasks: AgentTask[] = [
      { label: "success-agent", goal: "Succeed", agent: makeMockAgent("bsp") },
      { label: "fail-agent", goal: "Fail", agent: makeMockAgent("driver") },
    ];

    const config: OrchestratorConfig = {
      provider: failingProvider,
      projectCtx: { name: "test", mcu: "STM32", compiler: "gcc", build_system: "cmake" },
      cwd: "/tmp",
      concurrency: 1, // Sequential to ensure predictable ordering
    };

    const results = await runParallelAgents(tasks, config);
    expect(results).toHaveLength(2);

    // First agent succeeds
    expect(results[0].result).toBeDefined();
    expect(results[0].error).toBeUndefined();

    // Second agent fails but doesn't crash the orchestrator
    expect(results[1].error).toBeDefined();
    expect(results[1].error).toContain("Provider error");
  });

  it("respects concurrency limit", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const trackingProvider: LLMProvider = {
      name: "mock",
      init: async () => {},
      complete: async () => ({ content: "", usage: { input_tokens: 0, output_tokens: 0 }, stop_reason: "end_turn" }),
      isReady: () => true,
      status: () => ({ name: "mock", ready: true, model: "mock-model" }),
      supportsToolCalling: () => true,
      completeWithTools: async (): Promise<ToolCompletionResponse> => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 50));
        currentConcurrent--;
        return {
          content: [{ type: "text", text: "Done" }],
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: "end_turn",
        };
      },
    };

    const tasks: AgentTask[] = Array.from({ length: 5 }, (_, i) => ({
      label: `agent-${i}`,
      goal: `Task ${i}`,
      agent: makeMockAgent(`agent-${i}`),
    }));

    const config: OrchestratorConfig = {
      provider: trackingProvider,
      projectCtx: { name: "test", mcu: "STM32", compiler: "gcc", build_system: "cmake" },
      cwd: "/tmp",
      concurrency: 2,
    };

    const results = await runParallelAgents(tasks, config);
    expect(results).toHaveLength(5);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});
