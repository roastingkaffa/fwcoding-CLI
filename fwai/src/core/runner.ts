import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { ToolDef, StopCondition } from "../schemas/tool.schema.js";
import type { ToolResult, BootStatus } from "../schemas/evidence.schema.js";
import type { BootPatterns } from "../schemas/project.schema.js";
import { interpolate } from "../utils/interpolate.js";
import * as log from "../utils/logger.js";

export interface RunContext {
  runDir: string;
  variables: Record<string, unknown>;
  cwd: string;
  /** Boot patterns from project.yaml — passed for stop_conditions with boot_patterns.inherit */
  bootPatterns?: BootPatterns;
}

export interface RunResult {
  toolResult: ToolResult;
  bootStatus?: BootStatus;
}

/** Execute a tool command, capture output to log file, return result */
export async function runTool(
  tool: ToolDef,
  ctx: RunContext
): Promise<RunResult> {
  // Merge tool-level variables → ctx variables → add built-in run_dir
  const mergedVars: Record<string, unknown> = {
    ...ctx.variables,
    run_dir: ctx.runDir,
  };

  // Tool-level variables: interpolate their values against merged vars first
  if (tool.variables) {
    for (const [key, template] of Object.entries(tool.variables)) {
      mergedVars[key] = interpolate(template, mergedVars);
    }
  }

  const command = interpolate(tool.command, mergedVars);
  const workDir = path.resolve(ctx.cwd, tool.working_dir);
  const logFile = path.join(ctx.runDir, `${tool.name}.log`);

  log.info(`Running ${tool.name}: ${command}`);

  const startTime = Date.now();

  // Build pattern sets for real-time matching
  const { successPatterns, failurePatterns } = buildPatternSets(tool, ctx.bootPatterns);
  const hasLivePatterns = successPatterns.length > 0 || failurePatterns.length > 0;

  return new Promise((resolve) => {
    const logStream = fs.createWriteStream(logFile);
    const child = spawn("sh", ["-c", command], {
      cwd: workDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let bootStatus: BootStatus | undefined;
    let timedOut = false;
    let killedByPattern = false;

    // Determine effective timeout from stop_conditions or tool.timeout_sec
    const effectiveTimeout = getEffectiveTimeout(tool);

    // Timeout handling
    const timer = setTimeout(() => {
      timedOut = true;
      log.warn(`${tool.name} timed out after ${effectiveTimeout}s`);
      child.kill("SIGTERM");
    }, effectiveTimeout * 1000);

    // Real-time line matching (for monitor-type tools)
    if (hasLivePatterns) {
      setupLineMatching(child, successPatterns, failurePatterns, startTime, (matched) => {
        killedByPattern = true;
        bootStatus = matched;
        if (matched.status === "success") {
          log.success(`Boot pattern matched: ${matched.matched_pattern}`);
        } else {
          log.error(`Failure pattern matched: ${matched.matched_pattern}`);
        }
        child.kill("SIGTERM");
      });
    }

    // Pipe to log file
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });

    child.on("close", (code) => {
      clearTimeout(timer);

      const durationMs = Date.now() - startTime;
      const exitCode = code ?? 1;

      // Wait for log stream to flush before reading the file
      logStream.end(() => {
        // Post-exit pattern matching (for non-realtime tools like build/flash)
        const postMatchPattern = !hasLivePatterns
          ? matchPostExitPatterns(logFile, exitCode, tool)
          : bootStatus?.matched_pattern;

        // Determine status: boot pattern match overrides exit code
        let status: "success" | "fail";
        if (killedByPattern && bootStatus) {
          status = bootStatus.status === "success" ? "success" : "fail";
        } else if (timedOut) {
          status = "fail";
        } else {
          status = exitCode === 0 ? "success" : "fail";
        }

        // If monitor ran to timeout with no pattern match, set boot_status = unknown
        if (hasLivePatterns && !bootStatus) {
          bootStatus = {
            status: timedOut ? "unknown" : exitCode === 0 ? "success" : "fail",
            boot_time_ms: durationMs,
          };
        }

        if (status === "success") {
          log.success(`${tool.name} completed (${durationMs}ms)`);
        } else if (timedOut && hasLivePatterns) {
          log.warn(`${tool.name} stopped after ${effectiveTimeout}s (no pattern matched)`);
        } else {
          log.error(`${tool.name} failed (${durationMs}ms)`);
        }

        resolve({
          toolResult: {
            tool: tool.name,
            command,
            exit_code: killedByPattern
              ? (bootStatus?.status === "success" ? 0 : 1)
              : exitCode,
            duration_ms: durationMs,
            log_file: `${tool.name}.log`,
            status,
            pattern_matched: postMatchPattern,
          },
          bootStatus,
        });
      });
    });
  });
}

/** Build regex pattern sets from tool definition + project boot patterns */
function buildPatternSets(
  tool: ToolDef,
  bootPatterns?: BootPatterns
): { successPatterns: RegExp[]; failurePatterns: RegExp[] } {
  const successPatterns: RegExp[] = [];
  const failurePatterns: RegExp[] = [];

  // Check stop_conditions for boot_patterns
  const hasBootPatternCondition = tool.stop_conditions?.some(
    (sc) => sc.type === "boot_patterns"
  );

  if (hasBootPatternCondition && bootPatterns) {
    for (const p of bootPatterns.success_patterns) {
      try { successPatterns.push(new RegExp(p)); } catch { /* skip invalid */ }
    }
    for (const p of bootPatterns.failure_patterns) {
      try { failurePatterns.push(new RegExp(p)); } catch { /* skip invalid */ }
    }
  }

  // Check stop_conditions for match type
  if (tool.stop_conditions) {
    for (const sc of tool.stop_conditions) {
      if (sc.type === "match") {
        try { successPatterns.push(new RegExp(sc.pattern)); } catch { /* skip */ }
      }
    }
  }

  return { successPatterns, failurePatterns };
}

/** Get effective timeout from stop_conditions or fallback to tool.timeout_sec */
function getEffectiveTimeout(tool: ToolDef): number {
  if (tool.stop_conditions) {
    for (const sc of tool.stop_conditions) {
      if (sc.type === "timeout") return sc.value;
    }
  }
  return tool.timeout_sec;
}

/** Set up real-time line matching on child process stdout/stderr */
function setupLineMatching(
  child: ChildProcess,
  successPatterns: RegExp[],
  failurePatterns: RegExp[],
  startTime: number,
  onMatch: (status: BootStatus) => void
): void {
  let matched = false;

  const check = (line: string) => {
    if (matched) return;
    for (const re of successPatterns) {
      if (re.test(line)) {
        matched = true;
        onMatch({
          status: "success",
          matched_pattern: re.source,
          boot_time_ms: Date.now() - startTime,
        });
        return;
      }
    }
    for (const re of failurePatterns) {
      if (re.test(line)) {
        matched = true;
        onMatch({
          status: "fail",
          matched_pattern: re.source,
          boot_time_ms: Date.now() - startTime,
        });
        return;
      }
    }
  };

  if (child.stdout) {
    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", check);
  }
  if (child.stderr) {
    const rl = readline.createInterface({ input: child.stderr });
    rl.on("line", check);
  }
}

/** Post-exit pattern matching for build-type tools */
function matchPostExitPatterns(
  logFile: string,
  exitCode: number,
  tool: ToolDef
): string | undefined {
  if (!fs.existsSync(logFile)) return undefined;
  const content = fs.readFileSync(logFile, "utf-8");
  const patterns = exitCode === 0 ? tool.success_patterns : tool.failure_patterns;
  return matchPatterns(content, patterns);
}

function matchPatterns(
  content: string,
  patterns?: string[]
): string | undefined {
  if (!patterns) return undefined;
  for (const pattern of patterns) {
    try {
      if (new RegExp(pattern).test(content)) return pattern;
    } catch { /* skip invalid regex */ }
  }
  return undefined;
}
