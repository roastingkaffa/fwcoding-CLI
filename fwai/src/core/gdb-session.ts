import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

export interface GDBFrame {
  level: number;
  function: string;
  file?: string;
  line?: number;
}

export interface GDBBatchOptions {
  gdbBinary?: string;
  elfPath: string;
  commands: string[];
  remoteTarget?: string;
  timeoutSec?: number;
  cwd?: string;
}

export interface GDBBatchResult {
  output: string;
  registers?: Record<string, string>;
  backtrace?: GDBFrame[];
  exitCode: number;
  duration_ms: number;
}

/** Run GDB in batch mode with a script of commands */
export function runGDBBatch(options: GDBBatchOptions): GDBBatchResult {
  const {
    gdbBinary = "arm-none-eabi-gdb",
    elfPath,
    commands,
    remoteTarget,
    timeoutSec = 30,
    cwd,
  } = options;

  const start = Date.now();

  // Build GDB script
  const scriptLines: string[] = [];
  if (remoteTarget) {
    scriptLines.push(`target remote ${remoteTarget}`);
  }
  scriptLines.push(...commands);
  scriptLines.push("quit");

  const scriptPath = path.join(os.tmpdir(), `fwai-gdb-${Date.now()}.gdb`);
  fs.writeFileSync(scriptPath, scriptLines.join("\n") + "\n");

  let output = "";
  let exitCode = 0;

  try {
    output = execSync(`"${gdbBinary}" --batch --nx --command="${scriptPath}" "${elfPath}"`, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutSec * 1000,
      cwd,
      encoding: "utf-8",
    });
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; status?: number };
    output = (execErr.stdout ?? "") + "\n" + (execErr.stderr ?? "");
    exitCode = execErr.status ?? 1;
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }

  const duration_ms = Date.now() - start;

  // Parse registers and backtrace from output
  const registers = parseGDBRegisters(output);
  const backtrace = parseGDBBacktrace(output);

  return { output, registers, backtrace, exitCode, duration_ms };
}

/** Parse 'info registers' output into a key-value map */
export function parseGDBRegisters(output: string): Record<string, string> | undefined {
  const regs: Record<string, string> = {};
  // Match lines like: r0             0x0                 0
  const regex = /^(\w+)\s+(0x[0-9a-fA-F]+)\s/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(output)) !== null) {
    regs[match[1]] = match[2];
  }
  return Object.keys(regs).length > 0 ? regs : undefined;
}

/** Parse 'backtrace' output into structured frames */
export function parseGDBBacktrace(output: string): GDBFrame[] | undefined {
  const frames: GDBFrame[] = [];
  // Match lines like: #0  main () at src/main.c:42
  // or: #0  0x08000458 in main () at src/main.c:42
  const regex = /^#(\d+)\s+(?:0x[0-9a-fA-F]+ in\s+)?(\S+)\s*\(.*?\)(?:\s+at\s+(\S+):(\d+))?/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(output)) !== null) {
    frames.push({
      level: parseInt(match[1], 10),
      function: match[2],
      file: match[3],
      line: match[4] ? parseInt(match[4], 10) : undefined,
    });
  }
  return frames.length > 0 ? frames : undefined;
}
