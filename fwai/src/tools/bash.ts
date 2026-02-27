import { execSync } from "node:child_process";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "./tool-interface.js";

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const MAX_TIMEOUT_MS = 600_000; // 10 minutes

export const bashTool: AgenticTool = {
  definition: {
    name: "bash",
    description:
      "Execute a shell command and return its stdout/stderr. " +
      "Use for compilation, running tests, git operations, or any shell-level task. " +
      "Default timeout is 120 seconds.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 120, max: 600)",
        },
      },
      required: ["command"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const command = String(input.command);
    const timeoutSec = input.timeout ? Number(input.timeout) : undefined;
    const timeoutMs = timeoutSec
      ? Math.min(timeoutSec * 1000, MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

    try {
      const output = execSync(command, {
        cwd: context.cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024, // 2MB
        shell: "/bin/sh",
      });

      // Truncate very large outputs
      const maxLen = 50_000;
      const truncated = output.length > maxLen
        ? output.slice(0, maxLen) + "\n... (output truncated)"
        : output;

      return {
        content: truncated || "(no output)",
        is_error: false,
        metadata: { commands_run: [command] },
      };
    } catch (err) {
      if (err && typeof err === "object" && "stdout" in err && "stderr" in err) {
        const execErr = err as { stdout: string; stderr: string; status: number | null };
        const combined = (execErr.stdout || "") + (execErr.stderr || "");
        const maxLen = 50_000;
        const truncated = combined.length > maxLen
          ? combined.slice(0, maxLen) + "\n... (output truncated)"
          : combined;

        return {
          content: `Command exited with code ${execErr.status ?? 1}:\n${truncated || "(no output)"}`,
          is_error: true,
          metadata: { commands_run: [command] },
        };
      }
      return {
        content: `Command failed: ${err instanceof Error ? err.message : String(err)}`,
        is_error: true,
        metadata: { commands_run: [command] },
      };
    }
  },
};
