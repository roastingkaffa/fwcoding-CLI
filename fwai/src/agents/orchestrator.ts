/**
 * Multi-agent orchestrator with bounded concurrency.
 *
 * Runs multiple agentic tasks in parallel using a semaphore pattern.
 * Each task gets its own conversation history and config.
 */

import type { AgentConfig } from "../schemas/agent.schema.js";
import type { LLMProvider } from "../providers/provider.js";
import type { Policy } from "../schemas/config.schema.js";
import type { ToolDef } from "../schemas/tool.schema.js";
import type { ProjectContext } from "../utils/project-context.js";
import { createAgentLoopConfig } from "./agent-runtime.js";
import { runAgenticLoop, type AgenticLoopResult } from "./agentic-loop.js";
import * as log from "../utils/logger.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface AgentTask {
  /** Human-readable label for this task */
  label: string;
  /** The goal/prompt for the agent */
  goal: string;
  /** Agent config to use (determines tools, paths, system prompt) */
  agent: AgentConfig;
}

export interface OrchestratorConfig {
  provider: LLMProvider;
  projectCtx: ProjectContext;
  firmwareTools?: Map<string, ToolDef>;
  policy?: Policy;
  cwd: string;
  maxTokens?: number;
  /** Max concurrent agents (default: 3) */
  concurrency?: number;
}

export interface AgentTaskResult {
  label: string;
  result?: AgenticLoopResult;
  error?: string;
  duration_ms: number;
}

// ── Semaphore ─────────────────────────────────────────────────────────

class Semaphore {
  private queue: Array<() => void> = [];
  private current = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.current++;
        resolve();
      });
    });
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────

/**
 * Run multiple agent tasks in parallel with bounded concurrency.
 * Each agent runs independently with its own conversation history.
 * Errors in one agent do not affect others.
 */
export async function runParallelAgents(
  tasks: AgentTask[],
  config: OrchestratorConfig
): Promise<AgentTaskResult[]> {
  const concurrency = config.concurrency ?? 3;
  const semaphore = new Semaphore(concurrency);

  log.info(`Orchestrator: Running ${tasks.length} agent tasks (concurrency: ${concurrency})`);

  const promises = tasks.map(async (task): Promise<AgentTaskResult> => {
    await semaphore.acquire();
    const start = Date.now();

    try {
      log.info(`Agent [${task.label}]: Starting — ${task.goal.slice(0, 80)}`);

      const loopConfig = createAgentLoopConfig(task.agent, {
        provider: config.provider,
        projectCtx: config.projectCtx,
        firmwareTools: config.firmwareTools,
        policy: config.policy,
        cwd: config.cwd,
        maxTokens: config.maxTokens,
        onToolCall: (name) => log.info(`  [${task.label}] Tool: ${name}`),
        onToolResult: (name, _result, isError) => {
          if (isError) log.error(`  [${task.label}] Tool ${name} failed`);
          else log.success(`  [${task.label}] Tool ${name} done`);
        },
        onTextOutput: (text) => {
          log.info(
            `  [${task.label}] Output: ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`
          );
        },
      });

      const result = await runAgenticLoop(task.goal, [], loopConfig);
      const duration = Date.now() - start;

      log.success(
        `Agent [${task.label}]: Done (${result.toolCallCount} tool calls, ${result.iterations} iterations, ${duration}ms)`
      );

      return { label: task.label, result, duration_ms: duration };
    } catch (err) {
      const duration = Date.now() - start;
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Agent [${task.label}]: Failed — ${errMsg}`);
      return { label: task.label, error: errMsg, duration_ms: duration };
    } finally {
      semaphore.release();
    }
  });

  return Promise.all(promises);
}
