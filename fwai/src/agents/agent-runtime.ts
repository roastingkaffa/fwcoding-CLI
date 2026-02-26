import type { AgentConfig } from "../schemas/agent.schema.js";
import { formatContextBlock, type ProjectContext } from "../utils/project-context.js";

/** Assemble the full system prompt for an agent */
export function buildAgentSystemPrompt(
  agent: AgentConfig,
  projectCtx: ProjectContext
): string {
  const contextBlock = formatContextBlock(projectCtx);
  return `${contextBlock}\n\n${agent.system_prompt}`;
}

/** Get the model to use for an agent (resolve "inherit") */
export function resolveAgentModel(
  agent: AgentConfig,
  defaultModel: string
): string {
  return agent.model === "inherit" ? defaultModel : agent.model;
}
