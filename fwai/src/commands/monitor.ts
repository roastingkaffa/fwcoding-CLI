import type { AppContext } from "../repl.js";
import { runTool } from "../core/runner.js";
import { createRunSession, writeEvidence, buildHardwareState } from "../core/evidence.js";
import * as log from "../utils/logger.js";

export async function handleMonitor(args: string, ctx: AppContext): Promise<void> {
  const toolDef = ctx.tools.get("monitor");
  if (!toolDef) {
    log.error("No monitor tool defined. Check .fwai/tools/monitor.tool.yaml");
    return;
  }

  // Override duration if provided as arg
  const duration = args ? parseInt(args, 10) : undefined;
  const variables = { ...ctx.variables };
  if (duration && !isNaN(duration)) {
    variables["monitor_duration"] = duration;
  }

  const session = createRunSession("monitor");
  session.hardwareState = buildHardwareState(ctx.project.project);

  const { toolResult, bootStatus } = await runTool(toolDef, {
    runDir: session.runDir,
    variables,
    cwd: process.cwd(),
    bootPatterns: ctx.project.project.boot,
  });

  session.toolResults.push(toolResult);
  if (bootStatus) {
    session.bootStatus = bootStatus;
  }
  writeEvidence(session, ctx.projectCtx);
}
