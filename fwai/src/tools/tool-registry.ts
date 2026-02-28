/**
 * ToolRegistry: registers, queries, and filters agentic tools.
 * Produces LLMToolDefinition[] arrays for sending to the LLM.
 */

import type { LLMToolDefinition } from "../providers/tool-types.js";
import type { ToolDef } from "../schemas/tool.schema.js";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "./tool-interface.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { editFileTool } from "./edit-file.js";
import { searchGrepTool } from "./search-grep.js";
import { searchGlobTool } from "./search-glob.js";
import { bashTool } from "./bash.js";
import { wrapAllFirmwareTools } from "./firmware-tools.js";
import { gdbTool } from "./gdb-tool.js";

/** All built-in agentic tools */
const BUILTIN_TOOLS: AgenticTool[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  searchGrepTool,
  searchGlobTool,
  bashTool,
];

export class ToolRegistry {
  private tools = new Map<string, AgenticTool>();

  /** Register a single tool */
  register(tool: AgenticTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  /** Register multiple tools */
  registerAll(tools: AgenticTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /** Get a tool by name */
  get(name: string): AgenticTool | undefined {
    return this.tools.get(name);
  }

  /** Get all registered tool names */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Get LLM tool definitions for all registered tools */
  getDefinitions(): LLMToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /** Get LLM tool definitions filtered by a list of allowed tool names */
  getFilteredDefinitions(allowedNames: string[]): LLMToolDefinition[] {
    const set = new Set(allowedNames);
    return Array.from(this.tools.values())
      .filter((t) => set.has(t.definition.name))
      .map((t) => t.definition);
  }

  /** Execute a tool by name */
  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: `Error: Unknown tool "${name}". Available tools: ${this.getNames().join(", ")}`,
        is_error: true,
      };
    }
    return tool.execute(input, context);
  }

  /** Number of registered tools */
  get size(): number {
    return this.tools.size;
  }

  /** Create a registry with all built-in tools + firmware tools + optional gdb tool */
  static createDefault(firmwareTools?: Map<string, ToolDef>, opts?: { enableGdb?: boolean }): ToolRegistry {
    const registry = new ToolRegistry();
    registry.registerAll(BUILTIN_TOOLS);
    if (firmwareTools) {
      registry.registerAll(wrapAllFirmwareTools(firmwareTools));
    }
    if (opts?.enableGdb) {
      registry.register(gdbTool);
    }
    return registry;
  }

  /** Create a scoped registry with only the specified tool names */
  createScoped(allowedNames: string[]): ToolRegistry {
    const scoped = new ToolRegistry();
    const set = new Set(allowedNames);
    for (const [name, tool] of this.tools) {
      if (set.has(name)) {
        scoped.register(tool);
      }
    }
    return scoped;
  }
}
