import { execSync } from "node:child_process";
import path from "node:path";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "./tool-interface.js";

export const searchGrepTool: AgenticTool = {
  definition: {
    name: "grep",
    description:
      "Search file contents using regex pattern. Uses ripgrep (rg) if available, falls back to grep. " +
      "Returns matching lines with file paths and line numbers.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regex pattern to search for",
        },
        path: {
          type: "string",
          description: "Directory or file to search in (default: working directory)",
        },
        glob: {
          type: "string",
          description: "Glob pattern to filter files (e.g., '*.c', '*.h')",
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
    const glob = input.glob ? String(input.glob) : undefined;

    try {
      // Try ripgrep first, fall back to grep
      const cmd = buildSearchCommand(pattern, searchPath, glob);
      const output = execSync(cmd, {
        cwd: context.cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30_000,
        maxBuffer: 1024 * 1024, // 1MB
      });

      const lines = output.trim().split("\n").filter(Boolean);
      if (lines.length === 0) {
        return { content: "No matches found.", is_error: false };
      }

      // Limit output to prevent token overload
      const maxLines = 200;
      const truncated = lines.length > maxLines;
      const result = truncated
        ? lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} more matches truncated)`
        : lines.join("\n");

      return {
        content: `Found ${lines.length} match(es):\n${result}`,
        is_error: false,
      };
    } catch (err) {
      // grep/rg exit code 1 = no matches
      if (err && typeof err === "object" && "status" in err && err.status === 1) {
        return { content: "No matches found.", is_error: false };
      }
      return {
        content: `Search error: ${err instanceof Error ? err.message : String(err)}`,
        is_error: true,
      };
    }
  },
};

function buildSearchCommand(pattern: string, searchPath: string, glob?: string): string {
  // Escape pattern for shell
  const escaped = pattern.replace(/'/g, "'\\''");

  // Try ripgrep first (faster), fall back to grep
  const rgGlob = glob ? ` --glob '${glob}'` : "";
  const grepInclude = glob ? ` --include='${glob}'` : "";

  return (
    `rg --no-heading --line-number '${escaped}' '${searchPath}'${rgGlob} 2>/dev/null || ` +
    `grep -rn '${escaped}' '${searchPath}'${grepInclude} 2>/dev/null`
  );
}
