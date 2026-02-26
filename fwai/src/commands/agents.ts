import type { AppContext } from "../repl.js";
import { loadAgentMap } from "../agents/agent-loader.js";
import * as log from "../utils/logger.js";

export async function handleAgents(_args: string, _ctx: AppContext): Promise<void> {
  const agents = loadAgentMap();

  if (agents.size === 0) {
    log.info("No agents configured. Add YAML files to .fwai/agents/");
    return;
  }

  log.heading("\nConfigured Agents:\n");
  log.line();
  for (const [name, agent] of agents) {
    const model = agent.model === "inherit" ? "(inherit)" : agent.model;
    const desc = agent.description ?? "";
    console.log(`  ${name.padEnd(14)} ${model.padEnd(12)} ${desc}`);
  }
  log.line();
  console.log("");
}
