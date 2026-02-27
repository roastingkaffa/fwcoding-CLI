/**
 * /memory [elf_path] — Analyze firmware memory usage.
 *
 * Runs arm-none-eabi-size, parses output, displays usage table.
 * Reads flash_size/ram_size from project.yaml.
 */

import { execSync } from "node:child_process";
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
      elfPath = `${buildDir}/*.elf`;
      log.info(`No ELF path specified, looking in ${buildDir}/`);

      try {
        const found = execSync(`ls ${elfPath} 2>/dev/null | head -1`, {
          cwd: process.cwd(),
          encoding: "utf-8",
        }).trim();
        if (found) {
          elfPath = found;
        } else {
          log.error("No .elf files found in build directory. Run /build first or specify path.");
          return;
        }
      } catch {
        log.error("Could not find ELF file. Specify path: /memory path/to/firmware.elf");
        return;
      }
    } else {
      log.error("Usage: /memory <path/to/firmware.elf>");
      return;
    }
  }

  // Run arm-none-eabi-size
  try {
    const sizeRaw = execSync(`arm-none-eabi-size ${elfPath}`, {
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
