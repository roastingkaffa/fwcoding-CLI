import { execSync } from "node:child_process";
import path from "node:path";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "./tool-interface.js";

export const searchGlobTool: AgenticTool = {
  definition: {
    name: "glob",
    description:
      "Find files by name pattern using glob matching. " +
      "Returns matching file paths relative to the search directory.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern to match files (e.g., '**/*.c', 'src/**/*.h', 'Makefile')",
        },
        path: {
          type: "string",
          description: "Directory to search in (default: working directory)",
        },
      },
      required: ["pattern"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const pattern = String(input.pattern);
    const searchPath = input.path
      ? path.resolve(context.cwd, String(input.path))
      : context.cwd;

    try {
      // Use find with -name or -path depending on pattern complexity
      const cmd = buildGlobCommand(pattern, searchPath);
      const output = execSync(cmd, {
        cwd: searchPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15_000,
        maxBuffer: 512 * 1024,
      });

      const files = output.trim().split("\n").filter(Boolean);
      if (files.length === 0) {
        return { content: "No files found matching the pattern.", is_error: false };
      }

      const maxFiles = 500;
      const truncated = files.length > maxFiles;
      const result = truncated
        ? files.slice(0, maxFiles).join("\n") + `\n... (${files.length - maxFiles} more files truncated)`
        : files.join("\n");

      return {
        content: `Found ${files.length} file(s):\n${result}`,
        is_error: false,
      };
    } catch (err) {
      return {
        content: `Glob error: ${err instanceof Error ? err.message : String(err)}`,
        is_error: true,
      };
    }
  },
};

function buildGlobCommand(pattern: string, searchPath: string): string {
  const escaped = pattern.replace(/'/g, "'\\''");
  // Use find with pruning of common ignore directories
  return (
    `find '${searchPath}' ` +
    `\\( -name '.git' -o -name 'node_modules' -o -name 'build' -o -name '.fwai' \\) -prune -o ` +
    `-name '${escaped}' -print 2>/dev/null | sort | head -500`
  );
}
