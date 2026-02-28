import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluatePreToolHooks, runPostToolHooks } from "../../../src/core/hooks.js";
import type { PreToolUseHook, PostToolUseHook } from "../../../src/core/hooks.js";

describe("evaluatePreToolHooks", () => {
  it("returns allow when no hooks match", () => {
    const hooks: PreToolUseHook[] = [{ pattern: "bash", decision: "deny", reason: "blocked" }];
    const result = evaluatePreToolHooks("read_file", hooks);
    assert.equal(result.decision, "allow");
  });

  it("returns deny when exact match", () => {
    const hooks: PreToolUseHook[] = [{ pattern: "bash", decision: "deny", reason: "dangerous" }];
    const result = evaluatePreToolHooks("bash", hooks);
    assert.equal(result.decision, "deny");
    assert.equal(result.reason, "dangerous");
  });

  it("returns ask_user for ask hook", () => {
    const hooks: PreToolUseHook[] = [
      { pattern: "write_file", decision: "ask_user", reason: "confirm write" },
    ];
    const result = evaluatePreToolHooks("write_file", hooks);
    assert.equal(result.decision, "ask_user");
  });

  it("matches wildcard *", () => {
    const hooks: PreToolUseHook[] = [{ pattern: "*", decision: "ask_user" }];
    const result = evaluatePreToolHooks("anything", hooks);
    assert.equal(result.decision, "ask_user");
  });

  it("matches prefix wildcard", () => {
    const hooks: PreToolUseHook[] = [{ pattern: "mcp_*", decision: "ask_user" }];
    assert.equal(evaluatePreToolHooks("mcp_server_tool", hooks).decision, "ask_user");
    assert.equal(evaluatePreToolHooks("bash", hooks).decision, "allow");
  });

  it("first matching hook wins", () => {
    const hooks: PreToolUseHook[] = [
      { pattern: "bash", decision: "allow" },
      { pattern: "*", decision: "deny" },
    ];
    const result = evaluatePreToolHooks("bash", hooks);
    assert.equal(result.decision, "allow");
  });

  it("returns allow with empty hooks array", () => {
    const result = evaluatePreToolHooks("bash", []);
    assert.equal(result.decision, "allow");
  });
});

describe("runPostToolHooks", () => {
  it("calls matching hook callbacks", () => {
    const calls: string[] = [];
    const hooks: PostToolUseHook[] = [
      {
        pattern: "bash",
        onComplete: (name, result, isError) => {
          calls.push(`${name}:${isError}`);
        },
      },
    ];
    runPostToolHooks("bash", "output", false, hooks);
    assert.equal(calls.length, 1);
    assert.equal(calls[0], "bash:false");
  });

  it("skips non-matching hooks", () => {
    const calls: string[] = [];
    const hooks: PostToolUseHook[] = [
      {
        pattern: "bash",
        onComplete: () => calls.push("called"),
      },
    ];
    runPostToolHooks("read_file", "output", false, hooks);
    assert.equal(calls.length, 0);
  });

  it("continues if hook throws", () => {
    const calls: string[] = [];
    const hooks: PostToolUseHook[] = [
      {
        pattern: "*",
        onComplete: () => {
          throw new Error("boom");
        },
      },
      {
        pattern: "*",
        onComplete: () => calls.push("second"),
      },
    ];
    // Should not throw
    runPostToolHooks("bash", "output", false, hooks);
    assert.equal(calls.length, 1);
  });
});
