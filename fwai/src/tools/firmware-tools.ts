/**
 * Bridge: wraps existing .tool.yaml ToolDef entries as AgenticTool instances,
 * delegating execution to the existing runner.ts runTool().
 */

import path from "node:path";
import type { ToolDef } from "../schemas/tool.schema.js";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "./tool-interface.js";
import { runTool, type RunContext } from "../core/runner.js";
import { getRunsDir, generateRunId } from "../utils/paths.js";
import fs from "node:fs";

/** Convert a firmware ToolDef to an AgenticTool */
export function wrapFirmwareTool(toolDef: ToolDef): AgenticTool {
  return {
    definition: {
      name: `fw_${toolDef.name}`,
      description:
        toolDef.description ??
        `Firmware tool: ${toolDef.name} — runs: ${toolDef.command}`,
      input_schema: {
        type: "object",
        properties: {
          config: {
            type: "object",
            description: "Optional overrides for tool variables",
          },
        },
        required: [],
      },
    },

    async execute(
      input: Record<string, unknown>,
      context: ToolExecutionContext
    ): Promise<ToolExecutionResult> {
      // Create a temporary run directory for log files
      const runsDir = getRunsDir(context.cwd);
      const runId = generateRunId(toolDef.name);
      const runDir = path.join(runsDir, runId);
      fs.mkdirSync(runDir, { recursive: true });

      const runCtx: RunContext = {
        runDir,
        variables: (input.config as Record<string, unknown>) ?? {},
        cwd: context.cwd,
      };

      try {
        const { toolResult, bootStatus } = await runTool(toolDef, runCtx);

        let output = `Tool ${toolDef.name}: ${toolResult.status} (${toolResult.duration_ms}ms)`;
        if (toolResult.pattern_matched) {
          output += `\nMatched pattern: ${toolResult.pattern_matched}`;
        }
        if (bootStatus) {
          output += `\nBoot status: ${bootStatus.status}`;
          if (bootStatus.boot_time_ms) output += ` (${bootStatus.boot_time_ms}ms)`;
        }

        // Read log file content for the LLM
        const logPath = path.join(runDir, toolResult.log_file);
        if (fs.existsSync(logPath)) {
          let logContent = fs.readFileSync(logPath, "utf-8");
          if (logContent.length > 20_000) {
            logContent = logContent.slice(-20_000) + "\n... (log truncated, showing last 20K)";
          }
          output += `\n\n--- ${toolResult.log_file} ---\n${logContent}`;
        }

        return {
          content: output,
          is_error: toolResult.status === "fail",
          metadata: { commands_run: [toolResult.command] },
        };
      } catch (err) {
        return {
          content: `Firmware tool ${toolDef.name} failed: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        };
      }
    },
  };
}

/** Wrap all firmware tools from a ToolDef map */
export function wrapAllFirmwareTools(
  tools: Map<string, ToolDef>
): AgenticTool[] {
  return Array.from(tools.values()).map(wrapFirmwareTool);
}
