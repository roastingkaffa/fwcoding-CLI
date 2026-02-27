import fs from "node:fs";
import path from "node:path";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "./tool-interface.js";

export const readFileTool: AgenticTool = {
  definition: {
    name: "read_file",
    description:
      "Read a file from the filesystem. Returns file content with line numbers. " +
      "Use offset and limit to read specific portions of large files.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file (absolute or relative to working directory)",
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (1-based). Default: 1",
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to read. Default: 2000",
        },
      },
      required: ["file_path"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const filePath = String(input.file_path);
    const offset = Math.max(1, Number(input.offset) || 1);
    const limit = Math.min(5000, Math.max(1, Number(input.limit) || 2000));

    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(context.cwd, filePath);

    if (!fs.existsSync(resolved)) {
      return { content: `Error: File not found: ${resolved}`, is_error: true };
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return { content: `Error: Path is a directory, not a file: ${resolved}`, is_error: true };
    }

    try {
      const raw = fs.readFileSync(resolved, "utf-8");
      const allLines = raw.split("\n");
      const totalLines = allLines.length;
      const startIdx = offset - 1;
      const slice = allLines.slice(startIdx, startIdx + limit);

      // Format with line numbers (cat -n style)
      const numbered = slice
        .map((line, i) => {
          const lineNum = String(startIdx + i + 1).padStart(6, " ");
          return `${lineNum}\t${line}`;
        })
        .join("\n");

      const header = `File: ${resolved} (${totalLines} lines total, showing ${offset}-${Math.min(offset + limit - 1, totalLines)})`;
      return {
        content: `${header}\n${numbered}`,
        is_error: false,
        metadata: { files_read: [resolved] },
      };
    } catch (err) {
      return {
        content: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
        is_error: true,
      };
    }
  },
};
