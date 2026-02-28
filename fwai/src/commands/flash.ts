import type { AppContext } from "../repl.js";
import { runTool } from "../core/runner.js";
import { createRunSession, writeEvidence, buildHardwareState } from "../core/evidence.js";
import { checkFlashGuard } from "../core/policy.js";
import * as log from "../utils/logger.js";

export async function handleFlash(_args: string, ctx: AppContext): Promise<void> {
  const toolDef = ctx.tools.get("flash");
  if (!toolDef) {
    log.error("No flash tool defined. Check .fwai/tools/flash.tool.yaml");
    return;
  }

  // Flash guard: check last build
  if (ctx.config.policy.flash_guard.require_build_success) {
    if (!checkFlashGuard()) {
      log.error("Flash guard: no successful build found. Run /build first.");
      return;
    }
  }

  // Confirmation handling based on run mode
  const needsConfirm =
    ctx.config.policy.flash_guard.require_confirmation || toolDef.guard?.require_confirmation;

  if (needsConfirm) {
    if (ctx.runMode === "ci") {
      if (!ctx.cliFlags.yes) {
        log.error("Flash requires --yes flag in CI mode.");
        process.exitCode = 3;
        return;
      }
      log.info("CI mode: --yes flag set, skipping confirmation.");
    } else {
      const mcu = ctx.project.project.target.mcu;
      const port = ctx.project.project.serial.port;
      const message = toolDef.guard?.message ?? `Flash target [${mcu}] on [${port}]? (y/N) `;
      const confirmed = await ctx.confirm(message);
      if (!confirmed) {
        log.info("Flash cancelled.");
        return;
      }
    }
  }

  const session = createRunSession("flash");
  session.hardwareState = buildHardwareState(ctx.project.project);

  const { toolResult } = await runTool(toolDef, {
    runDir: session.runDir,
    variables: ctx.variables,
    cwd: process.cwd(),
  });

  // Parse detected_device from flash output if available
  if (session.hardwareState && toolResult.pattern_matched) {
    session.hardwareState.flash_verified = toolResult.status === "success";
  }

  session.toolResults.push(toolResult);
  writeEvidence(session, ctx.projectCtx);
}
