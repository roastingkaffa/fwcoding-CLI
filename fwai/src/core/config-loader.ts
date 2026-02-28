import fs from "node:fs";
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

/** Load and validate .fwai/config.yaml */
export function loadConfig(cwd?: string): Config {
  const filePath = workspacePath("config.yaml", cwd);
  return loadYaml(filePath, ConfigSchema);
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
