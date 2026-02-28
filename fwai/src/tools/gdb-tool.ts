import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "./tool-interface.js";
import { runGDBBatch } from "../core/gdb-session.js";

export const gdbTool: AgenticTool = {
  definition: {
    name: "gdb_debug",
    description:
      "Run GDB batch commands against a firmware ELF to debug: set breakpoints, examine registers, read memory, get backtraces. Returns parsed output with register values and stack frames.",
    input_schema: {
      type: "object" as const,
      properties: {
        elf_path: {
          type: "string",
          description: "Path to the ELF binary to debug",
        },
        gdb_commands: {
          type: "array",
          items: { type: "string" },
          description:
            "GDB commands to execute (e.g. ['break main', 'run', 'info registers', 'backtrace'])",
        },
        openocd_config: {
          type: "string",
          description: "Optional OpenOCD config file for remote target debugging",
        },
        remote_host: {
          type: "string",
          description:
            "Optional GDB remote target (e.g. 'localhost:3333'). Used instead of running locally.",
        },
        timeout_sec: {
          type: "number",
          description: "Timeout in seconds (default 30)",
        },
      },
      required: ["elf_path", "gdb_commands"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const elfPath = input.elf_path as string;
    const commands = input.gdb_commands as string[];
    const remoteHost = input.remote_host as string | undefined;
    const timeoutSec = (input.timeout_sec as number) ?? 30;

    try {
      const result = runGDBBatch({
        elfPath,
        commands,
        remoteTarget: remoteHost,
        timeoutSec,
        cwd: context.cwd,
      });

      const parts: string[] = [];
      parts.push(`GDB exited with code ${result.exitCode} (${result.duration_ms}ms)`);
      parts.push("");

      if (result.registers) {
        parts.push("=== Registers ===");
        for (const [reg, val] of Object.entries(result.registers)) {
          parts.push(`  ${reg}: ${val}`);
        }
        parts.push("");
      }

      if (result.backtrace) {
        parts.push("=== Backtrace ===");
        for (const frame of result.backtrace) {
          const loc = frame.file ? ` at ${frame.file}:${frame.line}` : "";
          parts.push(`  #${frame.level} ${frame.function}()${loc}`);
        }
        parts.push("");
      }

      parts.push("=== Raw Output ===");
      // Truncate to 20KB
      const raw =
        result.output.length > 20000
          ? result.output.slice(0, 20000) + "\n... (truncated)"
          : result.output;
      parts.push(raw);

      return {
        content: parts.join("\n"),
        is_error: result.exitCode !== 0,
        metadata: { commands_run: commands },
      };
    } catch (err) {
      return {
        content: `GDB error: ${err instanceof Error ? err.message : String(err)}`,
        is_error: true,
      };
    }
  },
};
