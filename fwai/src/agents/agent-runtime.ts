import type { AgentConfig } from "../schemas/agent.schema.js";
import type { LLMProvider } from "../providers/provider.js";
import type { Policy } from "../schemas/config.schema.js";
import type { ToolDef } from "../schemas/tool.schema.js";
import { formatContextBlock, type ProjectContext } from "../utils/project-context.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import type { AgenticLoopConfig } from "./agentic-loop.js";

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

/** Build a scoped AgenticLoopConfig from an agent definition */
export function createAgentLoopConfig(
  agent: AgentConfig,
  opts: {
    provider: LLMProvider;
    projectCtx: ProjectContext;
    firmwareTools?: Map<string, ToolDef>;
    policy?: Policy;
    cwd: string;
    maxTokens?: number;
    onToolCall?: AgenticLoopConfig["onToolCall"];
    onToolResult?: AgenticLoopConfig["onToolResult"];
    onTextOutput?: AgenticLoopConfig["onTextOutput"];
  }
): AgenticLoopConfig {
  // Build full registry then scope it to agent-allowed tools
  const fullRegistry = ToolRegistry.createDefault(opts.firmwareTools);
  const registry = agent.tools
    ? fullRegistry.createScoped(agent.tools)
    : fullRegistry;

  // Merge protected paths: policy + agent-specific
  const protectedPaths = [
    ...(opts.policy?.protected_paths ?? []),
    ...(agent.protected_paths ?? []),
  ];

  const systemPrompt = buildAgentSystemPrompt(agent, opts.projectCtx);

  return {
    provider: opts.provider,
    registry,
    systemPrompt,
    context: {
      cwd: opts.cwd,
      allowedPaths: agent.allowed_paths.length > 0 ? agent.allowed_paths : undefined,
      protectedPaths: protectedPaths.length > 0 ? protectedPaths : undefined,
      policy: opts.policy,
    },
    maxIterations: agent.max_iterations,
    maxTokens: opts.maxTokens,
    temperature: agent.temperature,
    onToolCall: opts.onToolCall,
    onToolResult: opts.onToolResult,
    onTextOutput: opts.onTextOutput,
  };
}
