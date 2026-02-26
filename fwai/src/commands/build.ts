import type { AppContext } from "../repl.js";
import { runTool } from "../core/runner.js";
import { createRunSession, writeEvidence, buildHardwareState } from "../core/evidence.js";
import { checkChangeBudget, displayBudgetResult } from "../core/policy.js";
import * as log from "../utils/logger.js";

export async function handleBuild(_args: string, ctx: AppContext): Promise<void> {
  const toolDef = ctx.tools.get("build");
  if (!toolDef) {
    log.error("No build tool defined. Check .fwai/tools/build.tool.yaml");
    return;
  }

  // Check change budget before build
  const budgetResult = checkChangeBudget(ctx.config.policy);
  if (!budgetResult.withinBudget) {
    displayBudgetResult(budgetResult);
    if (ctx.runMode === "ci") {
      log.error("CI mode: change budget exceeded. Aborting.");
      process.exitCode = 4;
      return;
    }
    log.warn("Change budget exceeded. Proceeding anyway in interactive mode.");
  }

  const session = createRunSession("build");
  session.hardwareState = buildHardwareState(ctx.project.project);

  const { toolResult } = await runTool(toolDef, {
    runDir: session.runDir,
    variables: ctx.variables,
    cwd: process.cwd(),
  });
  session.toolResults.push(toolResult);
  writeEvidence(session, ctx.projectCtx);
}
