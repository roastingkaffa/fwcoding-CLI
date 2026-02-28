import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runAgenticLoop } from "../../../src/agents/agentic-loop.js";
import type { LLMProvider } from "../../../src/providers/provider.js";
import type { ToolCompletionResponse, ToolCompletionRequest, StreamCallbacks } from "../../../src/providers/tool-types.js";
import { ToolRegistry } from "../../../src/tools/tool-registry.js";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "../../../src/tools/tool-interface.js";

function makeMockTool(name: string, response = "tool output"): AgenticTool {
  return {
    definition: {
      name,
      description: `Mock ${name}`,
      input_schema: { type: "object", properties: {} },
    },
    execute: async (_input: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> => ({
      content: response,
      is_error: false,
      metadata: {
        files_read: name === "read_file" ? ["/tmp/test.txt"] : [],
      },
    }),
  };
}

function makeMockProvider(responses: ToolCompletionResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    name: "mock",
    init: async () => {},
    complete: async () => ({ content: "", usage: { input_tokens: 0, output_tokens: 0 }, stop_reason: "end_turn" }),
    isReady: () => true,
    status: () => ({ name: "mock", ready: true, model: "mock-model" }),
    supportsToolCalling: () => true,
    completeWithTools: async (_req: ToolCompletionRequest): Promise<ToolCompletionResponse> => {
      const resp = responses[callIndex];
      if (callIndex < responses.length - 1) callIndex++;
      return resp;
    },
  };
}

describe("runAgenticLoop", () => {
  it("returns final text on end_turn", async () => {
    const provider = makeMockProvider([
      {
        content: [{ type: "text", text: "Hello from agent!" }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
      },
    ]);

    const registry = new ToolRegistry();
    const result = await runAgenticLoop("test input", [], {
      provider,
      registry,
      systemPrompt: "test",
      context: { cwd: "/tmp" },
    });

    assert.equal(result.finalText, "Hello from agent!");
    assert.equal(result.toolCallCount, 0);
    assert.equal(result.agenticCalls.length, 0);
  });

  it("handles tool_use then end_turn", async () => {
    const provider = makeMockProvider([
      {
        content: [
          { type: "text", text: "Let me read that file." },
          {
            type: "tool_use",
            id: "tool-1",
            name: "read_file",
            input: { path: "/tmp/test.txt" },
          },
        ],
        usage: { input_tokens: 20, output_tokens: 15 },
        stop_reason: "tool_use",
      },
      {
        content: [{ type: "text", text: "The file contains test data." }],
        usage: { input_tokens: 30, output_tokens: 10 },
        stop_reason: "end_turn",
      },
    ]);

    const registry = new ToolRegistry();
    registry.register(makeMockTool("read_file", "file contents here"));

    const toolCalls: string[] = [];
    const result = await runAgenticLoop("read the file", [], {
      provider,
      registry,
      systemPrompt: "test",
      context: { cwd: "/tmp" },
      onToolCall: (name) => toolCalls.push(name),
    });

    assert.equal(result.finalText, "The file contains test data.");
    assert.equal(result.toolCallCount, 1);
    assert.equal(result.agenticCalls.length, 1);
    assert.equal(result.agenticCalls[0].tool_name, "read_file");
    assert.ok(result.filesRead.includes("/tmp/test.txt"));
    assert.deepEqual(toolCalls, ["read_file"]); // onToolCall called during tool execution
  });

  it("respects maxIterations safety limit", async () => {
    // Provider always returns tool_use, never end_turn
    const provider = makeMockProvider([
      {
        content: [
          {
            type: "tool_use",
            id: "tool-loop",
            name: "bash",
            input: { command: "echo hi" },
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10 },
        stop_reason: "tool_use",
      },
    ]);

    const registry = new ToolRegistry();
    registry.register(makeMockTool("bash", "hi"));

    const result = await runAgenticLoop("loop forever", [], {
      provider,
      registry,
      systemPrompt: "test",
      context: { cwd: "/tmp" },
      maxIterations: 3,
    });

    // Should stop after 3 iterations
    assert.equal(result.toolCallCount, 3);
    assert.equal(result.agenticCalls.length, 3);
  });

  it("tracks filesRead and filesWritten via metadata", async () => {
    const writeTool: AgenticTool = {
      definition: {
        name: "write_file",
        description: "Mock write",
        input_schema: { type: "object", properties: {} },
      },
      execute: async () => ({
        content: "written",
        is_error: false,
        metadata: { files_written: ["/tmp/output.c"] },
      }),
    };

    const provider = makeMockProvider([
      {
        content: [
          { type: "tool_use", id: "t1", name: "read_file", input: { path: "/tmp/input.c" } },
          { type: "tool_use", id: "t2", name: "write_file", input: { path: "/tmp/output.c" } },
        ],
        usage: { input_tokens: 10, output_tokens: 10 },
        stop_reason: "tool_use",
      },
      {
        content: [{ type: "text", text: "Done." }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
      },
    ]);

    const registry = new ToolRegistry();
    registry.register(makeMockTool("read_file"));
    registry.register(writeTool);

    const result = await runAgenticLoop("do stuff", [], {
      provider,
      registry,
      systemPrompt: "test",
      context: { cwd: "/tmp" },
    });

    assert.ok(result.filesRead.includes("/tmp/test.txt"));
    assert.ok(result.filesWritten.includes("/tmp/output.c"));
    assert.equal(result.toolCallCount, 2);
  });
});
