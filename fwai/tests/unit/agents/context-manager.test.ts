import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateTokenCount, shouldCompress } from "../../../src/agents/context-manager.js";
import type { ToolMessage } from "../../../src/providers/tool-types.js";

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
