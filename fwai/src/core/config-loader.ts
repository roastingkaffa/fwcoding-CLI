import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse as parseYaml } from "yaml";
import { ConfigSchema, type Config } from "../schemas/config.schema.js";
import { ProjectSchema, type Project } from "../schemas/project.schema.js";
import { ToolDefSchema, type ToolDef } from "../schemas/tool.schema.js";
import { AgentConfigSchema, type AgentConfig } from "../schemas/agent.schema.js";
import { SkillConfigSchema, type SkillConfig } from "../schemas/skill.schema.js";
import { workspacePath } from "../utils/paths.js";
import { loadPluginArtifacts } from "./plugin-loader.js";
import * as log from "../utils/logger.js";

function loadYaml<T>(filePath: string, schema: { parse: (data: unknown) => T }): T {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = parseYaml(raw);
  return schema.parse(data);
}

/** Try to load a YAML file, return undefined if not found */
function tryLoadYaml(filePath: string): Record<string, unknown> | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const raw = fs.readFileSync(filePath, "utf-8");
    return parseYaml(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Deep merge objects: b overrides a, arrays are replaced */
function deepMerge(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...a };
  for (const key of Object.keys(b)) {
    const bVal = b[key];
    const aVal = a[key];
    if (
      bVal &&
      typeof bVal === "object" &&
      !Array.isArray(bVal) &&
      aVal &&
      typeof aVal === "object" &&
      !Array.isArray(aVal)
    ) {
      result[key] = deepMerge(aVal as Record<string, unknown>, bVal as Record<string, unknown>);
    } else if (bVal !== undefined) {
      result[key] = bVal;
    }
  }
  return result;
}

/**
 * Load config with 5-layer resolution:
 * 1. Schema defaults
 * 2. User global (~/.fwai/config.yaml)
 * 3. Project shared (.fwai/config.yaml)
 * 4. Project local (.fwai/config.local.yaml) — gitignored
 * 5. Org policy (loaded separately)
 *
 * Each layer deep-merges over the previous.
 */
export function loadConfig(cwd?: string): Config {
  // Layer 1: defaults come from Zod schema
  let merged: Record<string, unknown> = {};

  // Layer 2: user global config
  const userConfigPath = path.join(os.homedir(), ".fwai", "config.yaml");
  const userConfig = tryLoadYaml(userConfigPath);
  if (userConfig) {
    merged = deepMerge(merged, userConfig);
    log.debug("Loaded user config from ~/.fwai/config.yaml");
  }

  // Layer 3: project shared config
  const projectConfigPath = workspacePath("config.yaml", cwd);
  const projectConfig = tryLoadYaml(projectConfigPath);
  if (projectConfig) {
    merged = deepMerge(merged, projectConfig);
  } else {
    // If no project config exists, fall back to the raw load for error reporting
    return loadYaml(projectConfigPath, ConfigSchema);
  }

  // Layer 4: project local config (gitignored overrides)
  const localConfigPath = workspacePath("config.local.yaml", cwd);
  const localConfig = tryLoadYaml(localConfigPath);
  if (localConfig) {
    merged = deepMerge(merged, localConfig);
    log.debug("Loaded local config overrides from config.local.yaml");
  }

  // Validate merged config through Zod schema (applies defaults)
  return ConfigSchema.parse(merged);
}

/** Resolve the final config with all layers, returning also the resolved summary */
export function resolveConfig(cwd?: string): { config: Config; layers: string[] } {
  const layers: string[] = ["defaults"];

  const userConfigPath = path.join(os.homedir(), ".fwai", "config.yaml");
  if (fs.existsSync(userConfigPath)) layers.push("~/.fwai/config.yaml");

  const projectConfigPath = workspacePath("config.yaml", cwd);
  if (fs.existsSync(projectConfigPath)) layers.push(".fwai/config.yaml");

  const localConfigPath = workspacePath("config.local.yaml", cwd);
  if (fs.existsSync(localConfigPath)) layers.push(".fwai/config.local.yaml");

  return { config: loadConfig(cwd), layers };
}

/** Load and validate .fwai/project.yaml */
export function loadProject(cwd?: string): Project {
  const filePath = workspacePath("project.yaml", cwd);
  return loadYaml(filePath, ProjectSchema);
}

/** Load all tool definitions from .fwai/tools/*.tool.yaml + plugin tools */
export function loadTools(cwd?: string): ToolDef[] {
  const toolsDir = workspacePath("tools", cwd);
  const workspace: ToolDef[] = [];
  if (fs.existsSync(toolsDir)) {
    for (const f of fs.readdirSync(toolsDir).filter((f) => f.endsWith(".tool.yaml"))) {
      try {
        workspace.push(loadYaml(`${toolsDir}/${f}`, ToolDefSchema));
      } catch (e) {
        log.warn(`Failed to load tool ${f}: ${e}`);
      }
    }
  }

  // Merge plugin tools
  try {
    const pluginArtifacts = loadPluginArtifacts(cwd);
    return [...workspace, ...pluginArtifacts.tools];
  } catch {
    return workspace;
  }
}

/** Load all agent configs from .fwai/agents/*.agent.yaml + plugin agents */
export function loadAgents(cwd?: string): AgentConfig[] {
  const agentsDir = workspacePath("agents", cwd);
  const workspace: AgentConfig[] = [];
  if (fs.existsSync(agentsDir)) {
    for (const f of fs.readdirSync(agentsDir).filter((f) => f.endsWith(".agent.yaml"))) {
      try {
        workspace.push(loadYaml(`${agentsDir}/${f}`, AgentConfigSchema));
      } catch (e) {
        log.warn(`Failed to load agent ${f}: ${e}`);
      }
    }
  }

  try {
    const pluginArtifacts = loadPluginArtifacts(cwd);
    return [...workspace, ...pluginArtifacts.agents];
  } catch {
    return workspace;
  }
}

/** Load all skill configs from .fwai/skills/*.skill.yaml + plugin skills */
export function loadSkills(cwd?: string): SkillConfig[] {
  const skillsDir = workspacePath("skills", cwd);
  const workspace: SkillConfig[] = [];
  if (fs.existsSync(skillsDir)) {
    for (const f of fs.readdirSync(skillsDir).filter((f) => f.endsWith(".skill.yaml"))) {
      try {
        workspace.push(loadYaml(`${skillsDir}/${f}`, SkillConfigSchema));
      } catch (e) {
        log.warn(`Failed to load skill ${f}: ${e}`);
      }
    }
  }

  try {
    const pluginArtifacts = loadPluginArtifacts(cwd);
    return [...workspace, ...pluginArtifacts.skills];
  } catch {
    return workspace;
  }
}
