import fs from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "./tool-interface.js";

export const writeFileTool: AgenticTool = {
  definition: {
    name: "write_file",
    description:
      "Write content to a file. Creates the file and any parent directories if they don't exist. " +
      "Overwrites the file if it already exists. Respects protected paths.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file (absolute or relative to working directory)",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["file_path", "content"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const filePath = String(input.file_path);
    const content = String(input.content);

    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(context.cwd, filePath);

    // Check protected paths
    const relative = path.relative(context.cwd, resolved);
    if (context.protectedPaths?.some((p) => minimatch(relative, p))) {
      return {
        content: `Error: Path is protected and cannot be written to: ${relative}`,
        is_error: true,
      };
    }

    // Check allowed paths (if agent scope is active)
    if (context.allowedPaths && context.allowedPaths.length > 0) {
      const allowed = context.allowedPaths.some((p) => minimatch(relative, p));
      if (!allowed) {
        return {
          content: `Error: Path is outside the allowed scope: ${relative}. Allowed: ${context.allowedPaths.join(", ")}`,
          is_error: true,
        };
      }
    }

    try {
      // Create parent directory if needed
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resolved, content, "utf-8");
      const lines = content.split("\n").length;
      return {
        content: `Successfully wrote ${lines} lines to ${resolved}`,
        is_error: false,
        metadata: { files_written: [resolved] },
      };
    } catch (err) {
      return {
        content: `Error writing file: ${err instanceof Error ? err.message : String(err)}`,
        is_error: true,
      };
    }
  },
};
