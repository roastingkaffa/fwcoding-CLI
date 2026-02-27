/**
 * fwai library exports — stable API surface for external consumers (e.g. VS Code extension).
 * Read-only data access + provider/loop execution. No CLI or REPL concerns.
 */

// Core config & project
export { loadConfig, loadProject, loadTools } from "./core/config-loader.js";

// Evidence system
export { listRecentRuns, loadEvidence } from "./core/evidence.js";
export type { RunSession } from "./core/evidence.js";

// Skills
export { loadSkillMap, getSkill } from "./skills/skill-loader.js";

// Agents
export { loadAgentMap, getAgent } from "./agents/agent-loader.js";

// Policy engine
export { checkChangeBudget, checkProtectedPaths } from "./core/policy.js";
export type { BudgetCheckResult, FileChange } from "./core/policy.js";

// Workspace utilities
export { workspaceExists } from "./utils/paths.js";

// Project context
export { buildProjectContext, formatContextBlock } from "./utils/project-context.js";
export type { ProjectContext } from "./utils/project-context.js";

// Memory analysis
export { parseSizeOutput, computeMemoryReport } from "./tools/memory-analysis.js";
export type { SizeOutput, MemoryReport, MapSection } from "./tools/memory-analysis.js";

// Provider factory
export { createProvider } from "./providers/provider-factory.js";

// Agentic loop
export { runAgenticLoop } from "./agents/agentic-loop.js";
export type { AgenticLoopConfig, AgenticLoopResult } from "./agents/agentic-loop.js";

// Agent runtime
export { createAgentLoopConfig } from "./agents/agent-runtime.js";

// Tool registry
export { ToolRegistry } from "./tools/tool-registry.js";

// Re-export essential types from schemas
export type { Config, ProviderConfig, Policy } from "./schemas/config.schema.js";
export type { Project } from "./schemas/project.schema.js";
export type { Evidence, ToolResult, BootStatus, Changes, AgenticSession, MemoryAnalysis } from "./schemas/evidence.schema.js";
export type { SkillConfig, SkillStep } from "./schemas/skill.schema.js";
export type { AgentConfig } from "./schemas/agent.schema.js";
export type { ToolDef } from "./schemas/tool.schema.js";

// Provider & tool types
export type { LLMProvider } from "./providers/provider.js";
export type { ToolMessage, LLMToolDefinition, ContentBlock } from "./providers/tool-types.js";
export type { ToolExecutionContext, AgenticTool } from "./tools/tool-interface.js";
