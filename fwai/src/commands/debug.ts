import type { AppContext } from "../repl.js";
import { runGDBBatch } from "../core/gdb-session.js";
import { startOpenOCD } from "../core/openocd-session.js";
import { isFeatureEnabled } from "../core/license-manager.js";
import * as log from "../utils/logger.js";

export async function handleDebug(args: string, ctx: AppContext): Promise<void> {
  if (!isFeatureEnabled("gdb", ctx.license)) {
    log.error("GDB/debug feature requires a pro or higher license. Run /license activate <key>.");
    return;
  }

  const parts = args.trim().split(/\s+/);
  const sub = parts[0] || "run";

  const toolchain = ctx.project.project.toolchain;
  const gdbBinary = toolchain.debugger ?? "arm-none-eabi-gdb";
  const remoteTarget = toolchain.gdb_remote;

  if (sub === "run") {
    const elfPath = parts[1];
    if (!elfPath) {
      log.error("Usage: /debug run <elf> [gdb-commands...]");
      return;
    }
    const commands = parts.slice(2);
    if (commands.length === 0) {
      commands.push("info registers", "backtrace", "info threads");
    }

    const result = runGDBBatch({
      gdbBinary,
      elfPath,
      commands,
      remoteTarget,
    });

    if (result.registers) {
      log.heading("Registers");
      for (const [reg, val] of Object.entries(result.registers)) {
        log.info(`  ${reg}: ${val}`);
      }
    }

    if (result.backtrace) {
      log.heading("Backtrace");
      for (const frame of result.backtrace) {
        const loc = frame.file ? ` at ${frame.file}:${frame.line}` : "";
        log.info(`  #${frame.level} ${frame.function}()${loc}`);
      }
    }

    log.info(`\nGDB exited with code ${result.exitCode} (${result.duration_ms}ms)`);
    return;
  }

  if (sub === "registers") {
    const elfPath = parts[1];
    if (!elfPath) {
      log.error("Usage: /debug registers <elf>");
      return;
    }
    const result = runGDBBatch({
      gdbBinary,
      elfPath,
      commands: ["info registers"],
      remoteTarget,
    });
    if (result.registers) {
      log.heading("Registers");
      for (const [reg, val] of Object.entries(result.registers)) {
        log.info(`  ${reg}: ${val}`);
      }
    } else {
      log.info("No register data available.");
      log.info(result.output.slice(0, 500));
    }
    return;
  }

  if (sub === "backtrace") {
    const elfPath = parts[1];
    if (!elfPath) {
      log.error("Usage: /debug backtrace <elf>");
      return;
    }
    const result = runGDBBatch({
      gdbBinary,
      elfPath,
      commands: ["backtrace"],
      remoteTarget,
    });
    if (result.backtrace) {
      log.heading("Backtrace");
      for (const frame of result.backtrace) {
        const loc = frame.file ? ` at ${frame.file}:${frame.line}` : "";
        log.info(`  #${frame.level} ${frame.function}()${loc}`);
      }
    } else {
      log.info("No backtrace data available.");
      log.info(result.output.slice(0, 500));
    }
    return;
  }

  if (sub === "openocd") {
    const config = toolchain.openocd_config;
    if (!config) {
      log.error("No openocd_config set in project.yaml toolchain section.");
      return;
    }
    try {
      log.info(`Starting OpenOCD with config: ${config}...`);
      const handle = await startOpenOCD(config);
      log.success(`OpenOCD running — GDB port: ${handle.gdbPort}, Telnet port: ${handle.telnetPort}`);
      log.info("Press Ctrl+C to stop OpenOCD.");
      // Keep running until process exits
      await new Promise<void>((resolve) => {
        handle.process.on("exit", () => resolve());
      });
    } catch (err) {
      log.error(`OpenOCD failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  log.error(`Unknown debug subcommand: ${sub}. Use: run, registers, backtrace, openocd`);
}
