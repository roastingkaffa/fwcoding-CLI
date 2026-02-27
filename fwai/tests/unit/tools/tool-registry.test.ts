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
    expect(registry.get("test_tool")).toBe(tool);
    expect(registry.size).toBe(1);
  });

  it("registerAll adds multiple tools", () => {
    registry.registerAll([makeMockTool("a"), makeMockTool("b"), makeMockTool("c")]);
    expect(registry.size).toBe(3);
  });

  it("get returns undefined for unknown tool", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("getNames returns all registered tool names", () => {
    registry.registerAll([makeMockTool("alpha"), makeMockTool("beta")]);
    const names = registry.getNames();
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
    expect(names).toHaveLength(2);
  });

  it("getDefinitions returns LLMToolDefinition array", () => {
    registry.registerAll([makeMockTool("x"), makeMockTool("y")]);
    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(2);
    expect(defs[0]).toHaveProperty("name");
    expect(defs[0]).toHaveProperty("description");
    expect(defs[0]).toHaveProperty("input_schema");
  });

  it("getFilteredDefinitions filters by allowed names", () => {
    registry.registerAll([makeMockTool("a"), makeMockTool("b"), makeMockTool("c")]);
    const filtered = registry.getFilteredDefinitions(["a", "c"]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((d) => d.name)).toEqual(["a", "c"]);
  });

  it("execute runs tool and returns result", async () => {
    registry.register(makeMockTool("runner", "executed!"));
    const result = await registry.execute("runner", {}, { cwd: "/tmp" });
    expect(result.content).toBe("executed!");
    expect(result.is_error).toBe(false);
  });

  it("execute returns error for unknown tool", async () => {
    const result = await registry.execute("missing", {}, { cwd: "/tmp" });
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('Unknown tool "missing"');
  });

  it("createDefault includes built-in tools", () => {
    const reg = ToolRegistry.createDefault();
    const names = reg.getNames();
    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("edit_file");
    expect(names).toContain("bash");
    expect(names).toContain("grep");
    expect(names).toContain("glob");
    expect(reg.size).toBeGreaterThanOrEqual(6);
  });

  it("createScoped creates a subset registry", () => {
    registry.registerAll([makeMockTool("a"), makeMockTool("b"), makeMockTool("c")]);
    const scoped = registry.createScoped(["a", "c"]);
    expect(scoped.size).toBe(2);
    expect(scoped.get("a")).toBeDefined();
    expect(scoped.get("b")).toBeUndefined();
    expect(scoped.get("c")).toBeDefined();
  });

  it("createScoped with empty list creates empty registry", () => {
    registry.registerAll([makeMockTool("a"), makeMockTool("b")]);
    const scoped = registry.createScoped([]);
    expect(scoped.size).toBe(0);
  });
});
