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

// ── Phase 5: Enterprise Hardening ──

// Secret scanner
export { createScanner, scanEvidence, scanFile } from "./core/secret-scanner.js";

// Supply chain
export { auditNpmDependencies, verifyPluginIntegrity, verifyAllPlugins, checkToolchainBinaries } from "./core/supply-chain.js";

// Evidence signing
export { generateSigningKeyPair, signEvidence, verifyEvidenceSignature, loadSigningKey, loadVerifyKey } from "./core/evidence-signer.js";

// SBOM
export { generateSBOM, writeSBOM, formatSBOMSummary, generateSBOMForRun } from "./core/sbom-generator.js";

// Org policy
export { loadOrgPolicy, mergePolicy, validateRunAgainstPolicy } from "./core/org-policy.js";

// CI helpers
export { detectCI, generateGitHubActionsSummary, formatCIBadge } from "./core/ci-helpers.js";

// ── Type re-exports ──

export type { Config, Policy, ProviderConfig } from "./schemas/config.schema.js";
export type { Project, ToolchainConfig } from "./schemas/project.schema.js";
export type { ToolDef } from "./schemas/tool.schema.js";
export type { SkillConfig } from "./schemas/skill.schema.js";
export type { AgentConfig } from "./schemas/agent.schema.js";
export type { Evidence, ToolResult, BootStatus, Changes, AgenticSession, OTAEvidence, DebugEvidence, EvidenceSignature, EvidenceSBOM, EvidenceSecurity } from "./schemas/evidence.schema.js";
export type { MarketplacePackage } from "./schemas/marketplace.schema.js";
export type { License, CloudConfig } from "./schemas/license.schema.js";
export type { OTABundle, OTATarget, OTAPolicy } from "./schemas/ota.schema.js";
export type { LicenseStatus } from "./core/license-manager.js";
export type { OTAResult } from "./core/ota-manager.js";
export type { GDBBatchResult, GDBFrame } from "./core/gdb-session.js";
export type { RunSession } from "./core/evidence.js";
export type { ProjectContext } from "./utils/project-context.js";
export type { SecretScanner, ScanResult } from "./core/secret-scanner.js";
export type { CycloneDXBOM, CycloneDXComponent } from "./core/sbom-generator.js";
export type { OrgPolicy } from "./core/org-policy.js";
export type { CIEnvironment } from "./core/ci-helpers.js";
export type { NpmAuditResult, PluginIntegrityResult, ToolchainBinaryInfo } from "./core/supply-chain.js";
export type { SecurityConfig, OrgPolicyConfig } from "./schemas/config.schema.js";
export type { ProjectDependency } from "./schemas/project.schema.js";
