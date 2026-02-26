import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import { ConfigSchema, type Config } from "../schemas/config.schema.js";
import { ProjectSchema, type Project } from "../schemas/project.schema.js";
import { ToolDefSchema, type ToolDef } from "../schemas/tool.schema.js";
import { AgentConfigSchema, type AgentConfig } from "../schemas/agent.schema.js";
import { SkillConfigSchema, type SkillConfig } from "../schemas/skill.schema.js";
import { workspacePath } from "../utils/paths.js";
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

/** Load all tool definitions from .fwai/tools/*.tool.yaml */
export function loadTools(cwd?: string): ToolDef[] {
  const toolsDir = workspacePath("tools", cwd);
  if (!fs.existsSync(toolsDir)) return [];
  return fs
    .readdirSync(toolsDir)
    .filter((f) => f.endsWith(".tool.yaml"))
    .map((f) => {
      try {
        return loadYaml(`${toolsDir}/${f}`, ToolDefSchema);
      } catch (e) {
        log.warn(`Failed to load tool ${f}: ${e}`);
        return null;
      }
    })
    .filter((t): t is ToolDef => t !== null);
}

/** Load all agent configs from .fwai/agents/*.agent.yaml */
export function loadAgents(cwd?: string): AgentConfig[] {
  const agentsDir = workspacePath("agents", cwd);
  if (!fs.existsSync(agentsDir)) return [];
  return fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".agent.yaml"))
    .map((f) => {
      try {
        return loadYaml(`${agentsDir}/${f}`, AgentConfigSchema);
      } catch (e) {
        log.warn(`Failed to load agent ${f}: ${e}`);
        return null;
      }
    })
    .filter((a): a is AgentConfig => a !== null);
}

/** Load all skill configs from .fwai/skills/*.skill.yaml */
export function loadSkills(cwd?: string): SkillConfig[] {
  const skillsDir = workspacePath("skills", cwd);
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir)
    .filter((f) => f.endsWith(".skill.yaml"))
    .map((f) => {
      try {
        return loadYaml(`${skillsDir}/${f}`, SkillConfigSchema);
      } catch (e) {
        log.warn(`Failed to load skill ${f}: ${e}`);
        return null;
      }
    })
    .filter((s): s is SkillConfig => s !== null);
}
