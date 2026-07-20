import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estimateTokenCount,
  shouldCompress,
  compressConversation,
} from "../../../src/agents/context-manager.js";
import type { ToolMessage } from "../../../src/providers/tool-types.js";
import type { LLMProvider } from "../../../src/providers/provider.js";

// Minimal provider whose complete() returns a fixed summary.
const summarizingProvider = {
  name: "mock",
  init: async () => {},
  complete: async () => ({
    content: "SUMMARY",
    usage: { input_tokens: 0, output_tokens: 0 },
    stop_reason: "end_turn" as const,
  }),
  isReady: () => true,
  status: () => ({ name: "mock", ready: true, model: "mock" }),
  supportsToolCalling: () => false,
} as unknown as LLMProvider;

describe("estimateTokenCount", () => {
  it("estimates string content messages", () => {
    const messages: ToolMessage[] = [
      { role: "user", content: "Hello world" }, // 11 chars -> ~3 tokens
    ];
    const count = estimateTokenCount(messages);
    assert.equal(count, Math.ceil(11 / 4));
  });

  it("estimates content block messages", () => {
    const messages: ToolMessage[] = [
      {
        role: "assistant",
        content: [{ type: "text", text: "Hello world response" }],
      },
    ];
    const count = estimateTokenCount(messages);
    assert.ok(count > 0);
  });

  it("handles tool_use blocks", () => {
    const messages: ToolMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "bash",
            input: { command: "ls -la" },
          },
        ],
      },
    ];
    const count = estimateTokenCount(messages);
    assert.ok(count > 0);
  });

  it("returns 0 for empty messages", () => {
    assert.equal(estimateTokenCount([]), 0);
  });
});

describe("shouldCompress", () => {
  it("returns false when under threshold", () => {
    const messages: ToolMessage[] = [{ role: "user", content: "short" }];
    assert.equal(shouldCompress(messages, 4096), false);
  });

  it("returns true when over 80% threshold", () => {
    // Create a message that's ~4000 chars = ~1000 tokens
    const longContent = "x".repeat(4000);
    const messages: ToolMessage[] = [{ role: "user", content: longContent }];
    // maxTokens = 1000 → 80% = 800. Estimate = 1000 tokens. Should compress.
    assert.equal(shouldCompress(messages, 1000), true);
  });
});

describe("compressConversation", () => {
  it("never leaves a tool_result orphaned at the start of the retained tail", async () => {
    // 8 messages; default keepRecent=6 would split so the tail begins with a
    // tool_result whose tool_use is in the summarized half — the boundary must
    // move earlier to keep the pair together.
    const messages: ToolMessage[] = [
      { role: "user", content: "start" },
      { role: "assistant", content: "ack" },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "read", input: {} }],
      },
      // This tool_result is the one that must not be orphaned.
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
      },
      { role: "assistant", content: "m5" },
      { role: "user", content: "m6" },
      { role: "assistant", content: "m7" },
      { role: "user", content: "m8" },
    ];

    const result = await compressConversation(messages, summarizingProvider);

    // First entry is the summary; the tail must not begin with a tool_result.
    const tail = result.slice(1);
    const firstTail = tail[0];
    const firstIsToolResult =
      typeof firstTail.content !== "string" &&
      firstTail.content.length > 0 &&
      firstTail.content[0].type === "tool_result";
    assert.equal(firstIsToolResult, false);

    // Every tool_result in the tail has its tool_use present in the tail too.
    const toolUseIds = new Set<string>();
    for (const m of tail) {
      if (typeof m.content === "string") continue;
      for (const b of m.content) {
        if (b.type === "tool_use") toolUseIds.add(b.id);
      }
    }
    for (const m of tail) {
      if (typeof m.content === "string") continue;
      for (const b of m.content) {
        if (b.type === "tool_result") {
          assert.ok(toolUseIds.has(b.tool_use_id), "tool_result must keep its tool_use");
        }
      }
    }
  });
});
