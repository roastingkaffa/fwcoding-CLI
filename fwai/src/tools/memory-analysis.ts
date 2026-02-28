/**
 * Memory/ROM analysis tool.
 *
 * Pure functions for parsing arm-none-eabi-size output and .map files,
 * plus an AgenticTool wrapper for LLM-driven analysis.
 */

import { execSync } from "node:child_process";
import type { AgenticTool, ToolExecutionContext, ToolExecutionResult } from "./tool-interface.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface SizeOutput {
  text: number;
  data: number;
  bss: number;
  total: number;
}

export interface MapSection {
  name: string;
  address: number;
  size: number;
}

export interface MemoryReport {
  flash_used: number;
  flash_total: number;
  ram_used: number;
  ram_total: number;
  flash_percent: number;
  ram_percent: number;
  sections?: MapSection[];
  size_output?: SizeOutput;
}

// ── Pure Functions ────────────────────────────────────────────────────

/**
 * Parse Berkeley-format output from arm-none-eabi-size.
 *
 * Example input:
 *   text    data     bss     dec     hex filename
 *  12345    1234     567   14146    374a firmware.elf
 */
export function parseSizeOutput(output: string): SizeOutput | null {
  const lines = output.trim().split("\n");
  // Find the data line (skip header)
  for (const line of lines) {
    const match = line.trim().match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+/);
    if (match) {
      return {
        text: parseInt(match[1], 10),
        data: parseInt(match[2], 10),
        bss: parseInt(match[3], 10),
        total: parseInt(match[4], 10),
      };
    }
  }
  return null;
}

/**
 * Parse GCC linker .map file for section sizes.
 *
 * Looks for lines like:
 *   .text           0x08000000    0x3000
 *   .data           0x20000000     0x400
 *   .bss            0x20000400     0x200
 */
export function parseMapFile(content: string): MapSection[] {
  const sections: MapSection[] = [];
  const sectionRegex = /^(\.\w+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)/gm;

  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    const name = match[1];
    const address = parseInt(match[2], 16);
    const size = parseInt(match[3], 16);
    if (size > 0) {
      sections.push({ name, address, size });
    }
  }

  return sections;
}

/**
 * Compute a memory usage report from size output and total sizes.
 */
export function computeMemoryReport(
  sizeOutput: SizeOutput,
  flashTotal: number,
  ramTotal: number,
  sections?: MapSection[]
): MemoryReport {
  // Flash = text + data (code + initialized data)
  const flashUsed = sizeOutput.text + sizeOutput.data;
  // RAM = data + bss (initialized data + zero-initialized data)
  const ramUsed = sizeOutput.data + sizeOutput.bss;

  return {
    flash_used: flashUsed,
    flash_total: flashTotal,
    ram_used: ramUsed,
    ram_total: ramTotal,
    flash_percent: flashTotal > 0 ? Math.round((flashUsed / flashTotal) * 10000) / 100 : 0,
    ram_percent: ramTotal > 0 ? Math.round((ramUsed / ramTotal) * 10000) / 100 : 0,
    sections,
    size_output: sizeOutput,
  };
}

/**
 * Parse a size string like "512K" or "1M" to bytes.
 */
export function parseSizeString(s: string): number {
  const match = s.trim().match(/^(\d+(?:\.\d+)?)\s*([KkMmGg])?[Bb]?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] ?? "").toUpperCase();
  switch (unit) {
    case "K":
      return Math.round(num * 1024);
    case "M":
      return Math.round(num * 1024 * 1024);
    case "G":
      return Math.round(num * 1024 * 1024 * 1024);
    default:
      return Math.round(num);
  }
}

/**
 * Format a memory report as a human-readable table.
 */
export function formatMemoryTable(report: MemoryReport): string {
  const lines: string[] = [];

  lines.push("┌──────────┬────────────┬────────────┬─────────┐");
  lines.push("│ Region   │ Used       │ Total      │ Usage   │");
  lines.push("├──────────┼────────────┼────────────┼─────────┤");
  lines.push(
    `│ Flash    │ ${fmtBytes(report.flash_used).padEnd(10)} │ ${fmtBytes(report.flash_total).padEnd(10)} │ ${(report.flash_percent.toFixed(1) + "%").padStart(6)}  │`
  );
  lines.push(
    `│ RAM      │ ${fmtBytes(report.ram_used).padEnd(10)} │ ${fmtBytes(report.ram_total).padEnd(10)} │ ${(report.ram_percent.toFixed(1) + "%").padStart(6)}  │`
  );
  lines.push("└──────────┴────────────┴────────────┴─────────┘");

  if (report.size_output) {
    const so = report.size_output;
    lines.push("");
    lines.push(
      `  text: ${fmtBytes(so.text)}  data: ${fmtBytes(so.data)}  bss: ${fmtBytes(so.bss)}`
    );
  }

  if (report.sections && report.sections.length > 0) {
    lines.push("");
    lines.push("  Sections:");
    for (const s of report.sections) {
      lines.push(
        `    ${s.name.padEnd(16)} ${fmtBytes(s.size).padStart(10)}  @ 0x${s.address.toString(16).padStart(8, "0")}`
      );
    }
  }

  return lines.join("\n");
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── AgenticTool wrapper ───────────────────────────────────────────────

export const memoryAnalysisTool: AgenticTool = {
  definition: {
    name: "memory_analysis",
    description:
      "Analyze firmware memory usage (Flash/RAM) by running arm-none-eabi-size on an ELF binary. " +
      "Returns a memory usage report with section breakdown.",
    input_schema: {
      type: "object",
      properties: {
        elf_path: {
          type: "string",
          description: "Path to the ELF binary file to analyze",
        },
        flash_total: {
          type: "string",
          description:
            'Total flash size (e.g. "512K", "1M"). Optional — reads from project.yaml if omitted.',
        },
        ram_total: {
          type: "string",
          description:
            'Total RAM size (e.g. "128K", "256K"). Optional — reads from project.yaml if omitted.',
        },
        map_file: {
          type: "string",
          description: "Optional path to .map file for detailed section analysis",
        },
      },
      required: ["elf_path"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const elfPath = String(input.elf_path ?? "");
    const flashTotalStr = String(input.flash_total ?? "512K");
    const ramTotalStr = String(input.ram_total ?? "128K");
    const mapFile = input.map_file ? String(input.map_file) : undefined;

    if (!elfPath) {
      return { content: "Error: elf_path is required", is_error: true };
    }

    try {
      // Run arm-none-eabi-size
      const sizeCmd = `arm-none-eabi-size ${elfPath}`;
      const sizeRaw = execSync(sizeCmd, {
        cwd: context.cwd,
        encoding: "utf-8",
        timeout: 10_000,
      });

      const sizeOutput = parseSizeOutput(sizeRaw);
      if (!sizeOutput) {
        return {
          content: `Error: Failed to parse size output:\n${sizeRaw}`,
          is_error: true,
        };
      }

      // Parse .map file if provided
      let sections: MapSection[] | undefined;
      if (mapFile) {
        try {
          const { readFileSync } = await import("node:fs");
          const { resolve } = await import("node:path");
          const mapContent = readFileSync(resolve(context.cwd, mapFile), "utf-8");
          sections = parseMapFile(mapContent);
        } catch {
          // Map file parsing is optional
        }
      }

      const flashTotal = parseSizeString(flashTotalStr);
      const ramTotal = parseSizeString(ramTotalStr);
      const report = computeMemoryReport(sizeOutput, flashTotal, ramTotal, sections);

      return {
        content: formatMemoryTable(report) + "\n\n" + JSON.stringify(report, null, 2),
        is_error: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ENOENT") || msg.includes("not found")) {
        return {
          content: "Error: arm-none-eabi-size not found. Install the ARM toolchain.",
          is_error: true,
        };
      }
      return { content: `Error running memory analysis: ${msg}`, is_error: true };
    }
  },
};
