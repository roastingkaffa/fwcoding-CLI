#!/usr/bin/env node

import readline from "node:readline";
import fs from "node:fs";
import { Command } from "commander";
import { initWorkspace, requireWorkspace } from "./core/workspace.js";
import { loadConfig, loadProject, loadTools } from "./core/config-loader.js";
import { buildProjectContext } from "./utils/project-context.js";
import { workspacePath } from "./utils/paths.js";
import { configureLogger, configureOutputMode, getOutputMode } from "./utils/logger.js";
import type { OutputMode } from "./utils/logger.js";
import { resolveRunMode, isReplAllowed } from "./utils/run-mode.js";
import { createProvider } from "./providers/provider-factory.js";
import { globalTracer } from "./utils/llm-tracer.js";
import { startRepl, type AppContext } from "./repl.js";
import type { RunSession } from "./core/evidence.js";
import * as log from "./utils/logger.js";

const program = new Command();

program
  .name("fwai")
  .description("Firmware AI CLI — AI-assisted firmware development")
  .version("0.1.0");

// fwai init
program
  .command("init")
  .description("Initialize .fwai/ workspace in current directory")
  .option("-f, --force", "Overwrite existing .fwai/ directory")
  .action((opts) => {
    initWorkspace({ force: opts.force });
  });

// fwai doctor
program
  .command("doctor")
  .description("Check toolchain & environment health")
  .action(async () => {
    requireWorkspace();
    const ctx = await buildAppContext();
    const { handleDoctor } = await import("./commands/doctor.js");
    await handleDoctor("", ctx);
  });

// fwai run <skill>
program
  .command("run <skill>")
  .description("Run a skill non-interactively (CI-friendly)")
  .option("--ci", "CI mode: no interactive prompts, JSON output")
  .option("--yes", "Auto-confirm destructive actions (flash)")
  .option("--json", "Output a single JSON summary to stdout (suppresses all other stdout)")
  .option("--quiet", "Suppress all stdout output")
  .action(async (skillName, opts) => {
    requireWorkspace();
    const ctx = await buildAppContext(opts);

    const { getSkill } = await import("./skills/skill-loader.js");
    const skill = getSkill(skillName);
    if (!skill) {
      log.error(`Skill not found: ${skillName}`);
      outputJsonSummary(null, 5);
      process.exit(5);
    }

    // CI watchdog timer
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    if (opts.ci) {
      const timeoutSec = ctx.config.mode.ci.max_total_duration_sec;
      watchdog = setTimeout(() => {
        log.error(`CI watchdog: skill exceeded ${timeoutSec}s timeout. Aborting.`);
        outputJsonSummary(null, 7);
        process.exit(7);
      }, timeoutSec * 1000);
      watchdog.unref(); // Don't block process exit
    }

    const { runSkill } = await import("./skills/skill-runner.js");
    const session = await runSkill(skill, {
      tools: ctx.tools,
      projectCtx: ctx.projectCtx,
      variables: ctx.variables,
      cwd: process.cwd(),
      bootPatterns: ctx.project.project.boot,
      runMode: ctx.runMode,
      cliFlags: ctx.cliFlags,
      confirm: ctx.confirm,
      hardwareProject: ctx.project.project,
      policy: ctx.config.policy,
      provider: ctx.provider,
    });

    if (watchdog) clearTimeout(watchdog);

    // Exit code 3 = CI guard rejection, 4 = budget exceeded, 2 = tool failure, 0 = success
    if (process.exitCode === 3 || process.exitCode === 4) {
      outputJsonSummary(session, process.exitCode);
      process.exit(process.exitCode);
    }
    const failed = session.toolResults.some((t) => t.status === "fail");
    const exitCode = failed ? 2 : 0;
    outputJsonSummary(session, exitCode);
    process.exit(exitCode);
  });

// fwai (default: start REPL)
program
  .action(async () => {
    requireWorkspace();
    const ctx = await buildAppContext();

    const mode = resolveRunMode(ctx.config.mode, {});
    if (!isReplAllowed(mode)) {
      log.error("REPL not allowed in CI mode. Use `fwai run <skill>` instead.");
      process.exit(5);
    }

    await startRepl(ctx);
  });

/** Emit a JSON summary to stdout (bypasses logger quiet gate) */
function outputJsonSummary(session: RunSession | null, exitCode: number): void {
  if (getOutputMode() !== "json") return;

  const statusMap: Record<number, string> = {
    0: "success",
    2: "tool_failure",
    3: "ci_guard_rejected",
    4: "budget_exceeded",
    5: "skill_not_found",
    7: "timeout",
  };

  const summary: Record<string, unknown> = {
    run_id: session?.runId ?? null,
    status: statusMap[exitCode] ?? "error",
    exit_code: exitCode,
    tools: session?.toolResults.map((t) => ({
      tool: t.tool,
      status: t.status,
      duration_ms: t.duration_ms,
    })) ?? [],
    boot_status: session?.bootStatus ?? null,
    evidence_path: session?.runDir
      ? `${session.runDir}/evidence.json`
      : null,
    estimated_cost_usd: null,
  };

  // Pull estimated cost from the global tracer if available
  try {
    const cost = globalTracer.getEstimatedCost();
    if (cost !== undefined) summary.estimated_cost_usd = cost;
  } catch {
    // tracer may not have data
  }

  process.stdout.write(JSON.stringify(summary) + "\n");
}

async function buildAppContext(
  cliFlags: { ci?: boolean; yes?: boolean; json?: boolean; quiet?: boolean } = {}
): Promise<AppContext> {
  const config = loadConfig();
  const project = loadProject();

  // Determine output mode from flags
  let outMode: OutputMode = "normal";
  if (cliFlags.json) outMode = "json";
  else if (cliFlags.quiet) outMode = "quiet";
  configureOutputMode(outMode);

  // Disable colors in CI or when stdout is not a TTY
  const colorEnabled = config.logging.color && !cliFlags.ci && (process.stdout.isTTY ?? false);

  configureLogger(
    config.logging.level,
    colorEnabled
  );

  // Read compiler version from doctor cache
  let compilerVersion: string | undefined;
  try {
    const cachePath = workspacePath("logs/doctor-cache.json");
    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      compilerVersion = cache.versions?.[project.project.toolchain.compiler];
    }
  } catch {
    // Ignore cache read failures
  }

  const projectCtx = buildProjectContext(project, compilerVersion);
  const tools = loadTools();
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  // Initialize LLM provider
  let provider = null;
  try {
    provider = await createProvider(config.provider);
    if (provider.isReady()) {
      globalTracer.configure(config.provider.name, config.provider.model);
    }
  } catch (err) {
    log.debug(`Provider init failed: ${err}`);
  }

  const mode = resolveRunMode(config.mode, cliFlags);

  const variables: Record<string, unknown> = {
    project: project.project,
  };

  // Default confirm function for non-REPL usage (CLI/CI)
  const confirm = (message: string): Promise<boolean> => {
    if (cliFlags.yes) return Promise.resolve(true);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      });
    });
  };

  return {
    config,
    project,
    tools: toolMap,
    projectCtx,
    provider,
    variables,
    runMode: mode,
    cliFlags,
    confirm,
  };
}

program.parse();
