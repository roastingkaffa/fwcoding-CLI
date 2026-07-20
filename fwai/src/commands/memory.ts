/**
 * /memory [elf_path] — Analyze firmware memory usage.
 *
 * Runs arm-none-eabi-size, parses output, displays usage table.
 * Reads flash_size/ram_size from project.yaml.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AppContext } from "../repl.js";
import {
  parseSizeOutput,
  parseSizeString,
  computeMemoryReport,
  formatMemoryTable,
} from "../tools/memory-analysis.js";
import * as log from "../utils/logger.js";

export async function handleMemory(args: string, ctx: AppContext): Promise<void> {
  // Determine ELF path: argument or auto-detect from build dir
  let elfPath = args.trim();

  if (!elfPath) {
    // Try to auto-detect from project config
    const buildDir = ctx.project.project.build.build_dir;
    if (buildDir) {
      log.info(`No ELF path specified, looking in ${buildDir}/`);
      // Find .elf files without invoking a shell (no glob injection).
      let found: string | undefined;
      try {
        found = fs
          .readdirSync(buildDir)
          .filter((f) => f.endsWith(".elf"))
          .sort()[0];
      } catch {
        // build dir missing/unreadable — fall through to the not-found message
      }
      if (found) {
        elfPath = path.join(buildDir, found);
      } else {
        log.error("No .elf files found in build directory. Run /build first or specify path.");
        return;
      }
    } else {
      log.error("Usage: /memory <path/to/firmware.elf>");
      return;
    }
  }

  // Run arm-none-eabi-size (execFileSync — no shell, elfPath can't inject)
  try {
    const sizeRaw = execFileSync("arm-none-eabi-size", [elfPath], {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 10_000,
    });

    const sizeOutput = parseSizeOutput(sizeRaw);
    if (!sizeOutput) {
      log.error("Failed to parse arm-none-eabi-size output.");
      log.output(sizeRaw);
      return;
    }

    // Get total sizes from project.yaml
    const target = ctx.project.project.target;
    const flashTotal = parseSizeString(target.flash_size ?? "512K");
    const ramTotal = parseSizeString(target.ram_size ?? "128K");

    const report = computeMemoryReport(sizeOutput, flashTotal, ramTotal);
    console.log("");
    log.heading("Memory Usage");
    console.log(formatMemoryTable(report));
    console.log("");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      log.error("arm-none-eabi-size not found. Install the ARM toolchain.");
      log.info("Run /doctor to check toolchain availability.");
    } else {
      log.error(`Memory analysis failed: ${msg}`);
    }
  }
}
