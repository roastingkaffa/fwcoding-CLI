/**
 * /agent <name> command — starts an agentic chat session scoped to an agent's
 * tools, paths, and system prompt.
 */

import readline from "node:readline";
import type { AppContext } from "../repl.js";
import { getAgent } from "../agents/agent-loader.js";
import { createAgentLoopConfig } from "../agents/agent-runtime.js";
import { runAgenticLoop } from "../agents/agentic-loop.js";
import type { ToolMessage } from "../providers/tool-types.js";
import * as log from "../utils/logger.js";

export async function handleAgentChat(args: string, ctx: AppContext): Promise<void> {
  const agentName = args.trim();
  if (!agentName) {
    log.error("Usage: /agent <name>");
    log.info("Use /agents to list available agents.");
    return;
  }

  const agent = getAgent(agentName);
  if (!agent) {
    log.error(`Agent "${agentName}" not found.`);
    log.info("Use /agents to list available agents.");
    return;
  }

  if (!ctx.provider?.isReady()) {
    log.error("LLM not configured. Cannot start agent chat.");
    return;
  }

  if (!ctx.provider.supportsToolCalling()) {
    log.error("Current LLM provider does not support tool-calling. Agent chat requires it.");
    return;
  }

  // Display agent info
  log.heading(`[${agent.name} Agent]`);
  if (agent.description) log.info(agent.description);
  if (agent.allowed_paths.length > 0) {
    log.info(`Allowed paths: ${agent.allowed_paths.join(", ")}`);
  }
  if (agent.tools) {
    log.info(`Available tools: ${agent.tools.join(", ")}`);
  }
  console.log('  Type your request, or "exit" to leave agent mode.\n');

  const loopConfig = createAgentLoopConfig(agent, {
    provider: ctx.provider,
    projectCtx: ctx.projectCtx,
    firmwareTools: ctx.tools,
    policy: ctx.config.policy,
    cwd: process.cwd(),
    maxTokens: ctx.config.provider.max_tokens,
    onToolCall: (name, input) => {
      const summary = Object.entries(input)
        .map(([k, v]) => {
          const s = String(v);
          return `${k}: ${s.length > 60 ? s.slice(0, 60) + "..." : s}`;
        })
        .join(", ");
      log.info(`Tool: ${name}(${summary})`);
    },
    onToolResult: (name, result, isError) => {
      if (isError) {
        log.error(`Tool ${name} error: ${result.slice(0, 200)}`);
      } else {
        log.success(`Tool ${name} done (${result.length} chars)`);
      }
    },
    onTextOutput: (text) => {
      console.log("");
      console.log(text);
      console.log("");
    },
  });

  // Start a sub-REPL for agent chat
  const conversationHistory: ToolMessage[] = [];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${agent.name}> `,
  });

  rl.prompt();

  await new Promise<void>((resolve) => {
    rl.on("line", async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }
      if (input === "exit" || input === "/exit") {
        rl.close();
        return;
      }

      try {
        const result = await runAgenticLoop(input, conversationHistory, loopConfig);
        conversationHistory.length = 0;
        conversationHistory.push(...result.messages);
      } catch (err) {
        log.error(`Agent error: ${err instanceof Error ? err.message : String(err)}`);
      }

      rl.prompt();
    });

    rl.on("close", () => {
      log.info(`Left ${agent.name} agent mode.`);
      resolve();
    });
  });
}
