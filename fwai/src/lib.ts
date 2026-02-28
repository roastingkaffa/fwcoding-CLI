/**
 * Public API surface for the fwai library.
 * Re-exports key functions and types for programmatic use and VS Code extension.
 */

// Config & loading
export { loadConfig, loadProject, loadTools, loadAgents, loadSkills } from "./core/config-loader.js";
export { loadSkillMap, getSkill } from "./skills/skill-loader.js";
export { loadAgentMap, getAgent } from "./agents/agent-loader.js";

// Evidence
export { createRunSession, writeEvidence, listRecentRuns, loadEvidence, buildHardwareState } from "./core/evidence.js";

// Project context
export { buildProjectContext, formatContextBlock } from "./utils/project-context.js";

// Workspace
export { initWorkspace, requireWorkspace } from "./core/workspace.js";

// Paths
export { workspacePath, getRunsDir, workspaceExists } from "./utils/paths.js";

// Provider
export { createProvider } from "./providers/provider-factory.js";

// Agentic
export { runAgenticLoop } from "./agents/agentic-loop.js";
export { createAgentLoopConfig } from "./agents/agent-runtime.js";
export { ToolRegistry } from "./tools/tool-registry.js";

// Policy
export { checkChangeBudget, checkProtectedPaths } from "./core/policy.js";

// Memory (if available)
// export { parseSizeOutput, computeMemoryReport } from "./core/memory.js";

// ── Phase 4: Commercial Features ──

// Plugin marketplace
export { loadInstalledPlugins, installPlugin, uninstallPlugin, loadPluginArtifacts } from "./core/plugin-loader.js";
export { searchRegistry, getPackageInfo } from "./core/plugin-registry.js";

// License
export { validateLicense, loadCachedLicense, saveLicenseCache, isFeatureEnabled } from "./core/license-manager.js";

// Cloud sync
export { syncRunToCloud, syncAuditBatch } from "./core/cloud-sync.js";

// Audit export
export {
  collectAllEvidence,
  exportAsJson,
  exportAsJsonLines,
  exportAsCsv,
  exportAsSarif,
  exportAsHtml,
  computeChainHash,
  verifyChainHash,
  appendToAuditLog,
} from "./core/audit-export.js";

// OTA
export { buildOTABundle, listBundles, deployToTarget, deployToAll, rollback } from "./core/ota-manager.js";

// GDB/Debug
export { runGDBBatch, parseGDBRegisters, parseGDBBacktrace } from "./core/gdb-session.js";
export { startOpenOCD } from "./core/openocd-session.js";

// ── Type re-exports ──

export type { Config, Policy, ProviderConfig } from "./schemas/config.schema.js";
export type { Project, ToolchainConfig } from "./schemas/project.schema.js";
export type { ToolDef } from "./schemas/tool.schema.js";
export type { SkillConfig } from "./schemas/skill.schema.js";
export type { AgentConfig } from "./schemas/agent.schema.js";
export type { Evidence, ToolResult, BootStatus, Changes, AgenticSession, OTAEvidence, DebugEvidence } from "./schemas/evidence.schema.js";
export type { MarketplacePackage } from "./schemas/marketplace.schema.js";
export type { License, CloudConfig } from "./schemas/license.schema.js";
export type { OTABundle, OTATarget, OTAPolicy } from "./schemas/ota.schema.js";
export type { LicenseStatus } from "./core/license-manager.js";
export type { OTAResult } from "./core/ota-manager.js";
export type { GDBBatchResult, GDBFrame } from "./core/gdb-session.js";
export type { RunSession } from "./core/evidence.js";
export type { ProjectContext } from "./utils/project-context.js";
