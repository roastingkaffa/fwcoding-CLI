import type { AgentConfig } from "../schemas/agent.schema.js";
import { loadAgents } from "../core/config-loader.js";

/** Load all agents and return a map by name */
export function loadAgentMap(cwd?: string): Map<string, AgentConfig> {
  const agents = loadAgents(cwd);
  const map = new Map<string, AgentConfig>();
  for (const agent of agents) {
    map.set(agent.name, agent);
  }
  return map;
}

/** Get a specific agent by name */
export function getAgent(name: string, cwd?: string): AgentConfig | undefined {
  const map = loadAgentMap(cwd);
  return map.get(name);
}
