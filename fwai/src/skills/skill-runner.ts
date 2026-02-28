import fs from "node:fs";
import path from "node:path";
import type { SkillConfig } from "../schemas/skill.schema.js";
import type { ToolDef } from "../schemas/tool.schema.js";
import type { ProjectContext } from "../utils/project-context.js";
import type { BootPatterns } from "../schemas/project.schema.js";
import type { Policy } from "../schemas/config.schema.js";
import type { LLMProvider } from "../providers/provider.js";
import type { RunMode } from "../utils/run-mode.js";
import { runTool, type RunContext } from "../core/runner.js";
import {
  createRunSession,
  writeEvidence,
  buildHardwareState,
  type RunSession,
} from "../core/evidence.js";
import { checkChangeBudget, displayBudgetResult } from "../core/policy.js";
import { formatContextBlock } from "../utils/project-context.js";
import { globalTracer } from "../utils/llm-tracer.js";
import { runAgenticLoop } from "../agents/agentic-loop.js";
import { getAgent } from "../agents/agent-loader.js";
import { createAgentLoopConfig } from "../agents/agent-runtime.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { startSpinner, succeedSpinner, failSpinner } from "../utils/ui.js";
import * as log from "../utils/logger.js";

export interface SkillRunnerDeps {
  tools: Map<string, ToolDef>;
  projectCtx: ProjectContext;
  variables: Record<string, unknown>;
  cwd: string;
  bootPatterns?: BootPatterns;
  runMode?: RunMode;
  cliFlags?: { ci?: boolean; yes?: boolean; json?: boolean; quiet?: boolean };
  confirm?: (message: string) => Promise<boolean>;
  hardwareProject?: {
    serial: { port: string };
    toolchain: { debugger?: string; flasher?: string };
  };
  policy?: Policy;
  provider?: LLMProvider | null;
}

/** Interpolate ${var} references in a string */
function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    // Support nested access like project.target.mcu
    const parts = expr.trim().split(".");
    let value: unknown = vars;
    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return `\${${expr}}`; // Leave unresolved
      }
    }
    return String(value ?? `\${${expr}}`);
  });
}

/** Execute a skill's steps sequentially */
export async function runSkill(skill: SkillConfig, deps: SkillRunnerDeps): Promise<RunSession> {
  log.heading(`Running skill: ${skill.name}`);
  const session = createRunSession(skill.name, skill.name, deps.cwd);

  if (deps.hardwareProject) {
    session.hardwareState = buildHardwareState(deps.hardwareProject);
  }

  const runCtx: RunContext = {
    runDir: session.runDir,
    variables: { ...deps.variables, run_dir: session.runDir },
    cwd: deps.cwd,
    bootPatterns: deps.bootPatterns,
  };

  for (const step of skill.steps) {
    if ("tool" in step) {
      const toolDef = deps.tools.get(step.tool);
      if (!toolDef) {
        log.error(`Tool "${step.tool}" not found`);
        if (step.on_fail === "abort") break;
        continue;
      }

      // Check change budget before build
      if (step.tool === "build" && deps.policy) {
        const budgetResult = await checkChangeBudget(deps.policy, deps.cwd, deps.provider);
        if (!budgetResult.withinBudget) {
          displayBudgetResult(budgetResult);
          if (deps.runMode === "ci") {
            log.error("CI mode: change budget exceeded. Aborting.");
            process.exitCode = 4;
            break;
          }
          log.warn("Change budget exceeded. Proceeding anyway in interactive mode.");
        }
      }

      // Check tool guard (flash confirmation)
      if (toolDef.guard?.require_confirmation) {
        if (deps.runMode === "ci" && !deps.cliFlags?.yes) {
          log.error(`${toolDef.name} requires --yes flag in CI mode.`);
          process.exitCode = 3;
          break;
        }
        if (deps.runMode !== "ci" && deps.confirm) {
          const msg = toolDef.guard.message ?? `Run ${toolDef.name}? (y/N) `;
          if (!(await deps.confirm(msg))) {
            log.info(`${toolDef.name} cancelled.`);
            if (step.on_fail === "abort") break;
            continue;
          }
        }
      }

      startSpinner(`Running ${step.tool}...`);
      const { toolResult, bootStatus } = await runTool(toolDef, runCtx);
      session.toolResults.push(toolResult);
      if (bootStatus) session.bootStatus = bootStatus;

      if (toolResult.status === "fail") {
        failSpinner(`${step.tool} failed`);
        if (step.on_fail === "abort") {
          log.error(`Step "${step.tool}" failed, aborting skill`);
          break;
        }
      } else {
        succeedSpinner(`${step.tool} done`);
      }
    } else if ("action" in step && step.action === "evidence") {
      const evidence = writeEvidence(session, deps.projectCtx);
      if (step.summary) {
        printEvidenceSummary(evidence);
      }
    } else if ("action" in step && step.action === "llm_analyze") {
      await handleLLMAnalyze(step, session.runDir, deps);
    } else if ("action" in step && step.action === "agentic") {
      await handleAgenticStep(step, deps);
    }
  }

  return session;
}

/** Handle llm_analyze step: read log file, send to LLM, print analysis */
async function handleLLMAnalyze(
  step: { action: "llm_analyze"; input: string; prompt: string },
  runDir: string,
  deps: SkillRunnerDeps
): Promise<void> {
  // Interpolate variables in input path and prompt
  const vars: Record<string, unknown> = {
    ...deps.variables,
    run_dir: runDir,
  };
  const inputPath = interpolate(step.input, vars);
  const prompt = interpolate(step.prompt, vars);

  // Resolve input path (relative to cwd or absolute)
  const resolvedPath = path.isAbsolute(inputPath) ? inputPath : path.join(deps.cwd, inputPath);

  // Read input file
  let fileContent = "";
  if (fs.existsSync(resolvedPath)) {
    fileContent = fs.readFileSync(resolvedPath, "utf-8");
    // Truncate very large files to avoid token limits
    if (fileContent.length > 50000) {
      fileContent = fileContent.slice(0, 50000) + "\n... (truncated)";
    }
  } else {
    log.warn(`LLM analyze: input file not found: ${resolvedPath}`);
    fileContent = "(file not found)";
  }

  if (!deps.provider?.isReady()) {
    log.warn("LLM not configured. Skipping llm_analyze step.");
    log.info(`Would analyze: ${path.basename(inputPath)}`);
    return;
  }

  log.info(`Analyzing ${path.basename(inputPath)} with LLM...`);
  startSpinner(`Analyzing ${path.basename(inputPath)}...`);

  // Build system prompt with project context
  const contextBlock = formatContextBlock(deps.projectCtx);
  const systemPrompt = `${contextBlock}\n\nYou are a firmware development assistant specializing in build analysis and debugging. Be concise, technical, and actionable.`;

  // Build user message: prompt + file content
  const userMessage = `${prompt}\n\n--- File content (${path.basename(inputPath)}) ---\n${fileContent}`;

  const timer = globalTracer.startCall("llm_analyze");
  try {
    const response = await deps.provider.complete({
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });

    timer.finish(response.usage.input_tokens, response.usage.output_tokens, {
      input_file: path.basename(inputPath),
    });

    succeedSpinner(`Analysis complete`);

    // Print analysis
    log.output("");
    log.heading("LLM Analysis:");
    log.output(response.content);
    log.output("");
  } catch (err) {
    timer.finish(0, 0, { error: String(err) });
    failSpinner(`Analysis failed`);
    log.error(`LLM analyze failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Handle agentic step: LLM-driven autonomous execution */
async function handleAgenticStep(
  step: {
    action: "agentic";
    goal: string;
    agent?: string;
    max_iterations?: number;
    tools?: string[];
  },
  deps: SkillRunnerDeps
): Promise<void> {
  if (!deps.provider?.isReady()) {
    log.warn("LLM not configured. Skipping agentic step.");
    return;
  }
  if (!deps.provider.supportsToolCalling()) {
    log.warn("Provider does not support tool-calling. Skipping agentic step.");
    return;
  }

  log.info(`Agentic step: ${step.goal.slice(0, 100)}${step.goal.length > 100 ? "..." : ""}`);

  // If agent is specified, use agent-scoped config
  if (step.agent) {
    const agent = getAgent(step.agent);
    if (!agent) {
      log.error(`Agent "${step.agent}" not found. Skipping agentic step.`);
      return;
    }

    // Override max_iterations if step specifies it
    if (step.max_iterations) {
      agent.max_iterations = step.max_iterations;
    }

    const loopConfig = createAgentLoopConfig(agent, {
      provider: deps.provider,
      projectCtx: deps.projectCtx,
      firmwareTools: deps.tools,
      policy: deps.policy,
      cwd: deps.cwd,
      onToolCall: (name, _input) => log.info(`  Tool: ${name}`),
      onToolResult: (name, _result, isError) => {
        if (isError) log.error(`  Tool ${name} failed`);
        else log.success(`  Tool ${name} done`);
      },
      onTextOutput: (text) => {
        console.log("");
        console.log(text);
        console.log("");
      },
    });

    await runAgenticLoop(step.goal, [], loopConfig);
    return;
  }

  // No agent specified — use default tools with optional tool filtering
  const fullRegistry = ToolRegistry.createDefault(deps.tools);
  const registry = step.tools ? fullRegistry.createScoped(step.tools) : fullRegistry;

  const contextBlock = formatContextBlock(deps.projectCtx);
  const systemPrompt = `${contextBlock}\n\nYou are a firmware development assistant. Complete the following goal using the available tools. Be precise and minimal in your changes.`;

  await runAgenticLoop(step.goal, [], {
    provider: deps.provider,
    registry,
    systemPrompt,
    context: {
      cwd: deps.cwd,
      protectedPaths: deps.policy?.protected_paths,
    },
    maxIterations: step.max_iterations,
    onToolCall: (name, _input) => log.info(`  Tool: ${name}`),
    onToolResult: (name, _result, isError) => {
      if (isError) log.error(`  Tool ${name} failed`);
      else log.success(`  Tool ${name} done`);
    },
    onTextOutput: (text) => {
      console.log("");
      console.log(text);
      console.log("");
    },
  });
}

/** Print a compact evidence summary */
function printEvidenceSummary(evidence: {
  status: string;
  tools: Array<{ tool: string; status: string; duration_ms: number }>;
  boot_status?: { status: string; matched_pattern?: string; boot_time_ms?: number };
  llm?: { total_input_tokens: number; total_output_tokens: number; estimated_cost_usd?: number };
}): void {
  const toolSummary = evidence.tools
    .map((t) => `${t.tool} ${t.status === "success" ? "✓" : "✗"}`)
    .join(", ");

  log.info(`Evidence: ${evidence.status.toUpperCase()} [${toolSummary}]`);

  if (evidence.boot_status) {
    const bs = evidence.boot_status;
    const bootInfo = bs.boot_time_ms ? ` (${bs.boot_time_ms}ms)` : "";
    log.info(
      `Boot: ${bs.status}${bootInfo}${bs.matched_pattern ? ` — "${bs.matched_pattern}"` : ""}`
    );
  }

  if (evidence.llm) {
    const tokens = `${evidence.llm.total_input_tokens} in / ${evidence.llm.total_output_tokens} out`;
    const cost = evidence.llm.estimated_cost_usd
      ? ` (~$${evidence.llm.estimated_cost_usd.toFixed(4)})`
      : "";
    log.info(`LLM tokens: ${tokens}${cost}`);
  }
}
