import fs from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "./tool-interface.js";

export const editFileTool: AgenticTool = {
  definition: {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string match with new content. " +
      "The old_text must be unique within the file. Respects protected paths.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file (absolute or relative to working directory)",
        },
        old_text: {
          type: "string",
          description: "The exact text to find and replace (must be unique in the file)",
        },
        new_text: {
          type: "string",
          description: "The replacement text",
        },
      },
      required: ["file_path", "old_text", "new_text"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const filePath = String(input.file_path);
    const oldText = String(input.old_text);
    const newText = String(input.new_text);

    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(context.cwd, filePath);

    // Check protected paths
    const relative = path.relative(context.cwd, resolved);
    if (context.protectedPaths?.some((p) => minimatch(relative, p))) {
      return {
        content: `Error: Path is protected and cannot be edited: ${relative}`,
        is_error: true,
      };
    }

    // Check allowed paths
    if (context.allowedPaths && context.allowedPaths.length > 0) {
      const allowed = context.allowedPaths.some((p) => minimatch(relative, p));
      if (!allowed) {
        return {
          content: `Error: Path is outside the allowed scope: ${relative}. Allowed: ${context.allowedPaths.join(", ")}`,
          is_error: true,
        };
      }
    }

    if (!fs.existsSync(resolved)) {
      return { content: `Error: File not found: ${resolved}`, is_error: true };
    }

    try {
      const content = fs.readFileSync(resolved, "utf-8");

      // Check for exact match
      const firstIdx = content.indexOf(oldText);
      if (firstIdx === -1) {
        return {
          content: `Error: old_text not found in file. Make sure it matches exactly (including whitespace and indentation).`,
          is_error: true,
        };
      }

      // Check for uniqueness
      const secondIdx = content.indexOf(oldText, firstIdx + 1);
      if (secondIdx !== -1) {
        return {
          content: `Error: old_text is not unique in the file (found at least 2 occurrences). Provide a larger context string to make it unique.`,
          is_error: true,
        };
      }

      // Perform replacement
      const updated =
        content.slice(0, firstIdx) + newText + content.slice(firstIdx + oldText.length);
      fs.writeFileSync(resolved, updated, "utf-8");

      // Calculate line info for feedback
      const oldLines = oldText.split("\n").length;
      const newLines = newText.split("\n").length;
      const startLine = content.slice(0, firstIdx).split("\n").length;

      return {
        content: `Successfully edited ${resolved}: replaced ${oldLines} line(s) at line ${startLine} with ${newLines} line(s).`,
        is_error: false,
        metadata: { files_written: [resolved] },
      };
    } catch (err) {
      return {
        content: `Error editing file: ${err instanceof Error ? err.message : String(err)}`,
        is_error: true,
      };
    }
  },
};
