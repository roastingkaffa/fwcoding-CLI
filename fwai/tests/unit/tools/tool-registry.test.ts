import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry } from "../../../src/tools/tool-registry.js";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "../../../src/tools/tool-interface.js";

function makeMockTool(name: string, response = "ok"): AgenticTool {
  return {
    definition: {
      name,
      description: `Mock ${name} tool`,
      input_schema: { type: "object", properties: {} },
    },
    execute: async (_input: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> => ({
      content: response,
      is_error: false,
    }),
  };
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("register and get a tool", () => {
    const tool = makeMockTool("test_tool");
    registry.register(tool);
    assert.equal(registry.get("test_tool"), tool);
    assert.equal(registry.size, 1);
  });

  it("registerAll adds multiple tools", () => {
    registry.registerAll([makeMockTool("a"), makeMockTool("b"), makeMockTool("c")]);
    assert.equal(registry.size, 3);
  });

  it("get returns undefined for unknown tool", () => {
    assert.equal(registry.get("nonexistent"), undefined);
  });

  it("getNames returns all registered tool names", () => {
    registry.registerAll([makeMockTool("alpha"), makeMockTool("beta")]);
    const names = registry.getNames();
    assert.ok(names.includes("alpha"));
    assert.ok(names.includes("beta"));
    assert.equal(names.length, 2);
  });

  it("getDefinitions returns LLMToolDefinition array", () => {
    registry.registerAll([makeMockTool("x"), makeMockTool("y")]);
    const defs = registry.getDefinitions();
    assert.equal(defs.length, 2);
    assert.ok("name" in defs[0]);
    assert.ok("description" in defs[0]);
    assert.ok("input_schema" in defs[0]);
  });

  it("getFilteredDefinitions filters by allowed names", () => {
    registry.registerAll([makeMockTool("a"), makeMockTool("b"), makeMockTool("c")]);
    const filtered = registry.getFilteredDefinitions(["a", "c"]);
    assert.equal(filtered.length, 2);
    assert.deepEqual(filtered.map((d) => d.name), ["a", "c"]);
  });

  it("execute runs tool and returns result", async () => {
    registry.register(makeMockTool("runner", "executed!"));
    const result = await registry.execute("runner", {}, { cwd: "/tmp" });
    assert.equal(result.content, "executed!");
    assert.equal(result.is_error, false);
  });

  it("execute returns error for unknown tool", async () => {
    const result = await registry.execute("missing", {}, { cwd: "/tmp" });
    assert.equal(result.is_error, true);
    assert.ok(result.content.includes('Unknown tool "missing"'));
  });

  it("createDefault includes built-in tools", () => {
    const reg = ToolRegistry.createDefault();
    const names = reg.getNames();
    assert.ok(names.includes("read_file"));
    assert.ok(names.includes("write_file"));
    assert.ok(names.includes("edit_file"));
    assert.ok(names.includes("bash"));
    assert.ok(names.includes("grep"));
    assert.ok(names.includes("glob"));
    assert.ok(reg.size >= 6);
  });

  it("createScoped creates a subset registry", () => {
    registry.registerAll([makeMockTool("a"), makeMockTool("b"), makeMockTool("c")]);
    const scoped = registry.createScoped(["a", "c"]);
    assert.equal(scoped.size, 2);
    assert.ok(scoped.get("a") !== undefined);
    assert.equal(scoped.get("b"), undefined);
    assert.ok(scoped.get("c") !== undefined);
  });

  it("createScoped with empty list creates empty registry", () => {
    registry.registerAll([makeMockTool("a"), makeMockTool("b")]);
    const scoped = registry.createScoped([]);
    assert.equal(scoped.size, 0);
  });
});
