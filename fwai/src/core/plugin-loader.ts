import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parse as parseYaml } from "yaml";
import { workspacePath } from "../utils/paths.js";
import { ToolDefSchema, type ToolDef } from "../schemas/tool.schema.js";
import { SkillConfigSchema, type SkillConfig } from "../schemas/skill.schema.js";
import { AgentConfigSchema, type AgentConfig } from "../schemas/agent.schema.js";
import type { MarketplacePackage } from "../schemas/marketplace.schema.js";
import { fetchPackage } from "./plugin-registry.js";
import * as log from "../utils/logger.js";

const PLUGINS_DIR = "plugins";

export interface PluginManifest extends MarketplacePackage {
  installedAt?: string;
}

/** Scan .fwai/plugins/<name>/ directories and parse plugin.yaml manifests */
export function loadInstalledPlugins(cwd?: string): PluginManifest[] {
  const pluginsDir = workspacePath(PLUGINS_DIR, cwd);
  if (!fs.existsSync(pluginsDir)) return [];

  const results: PluginManifest[] = [];
  for (const dir of fs.readdirSync(pluginsDir)) {
    const manifestPath = path.join(pluginsDir, dir, "plugin.yaml");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const raw = parseYaml(fs.readFileSync(manifestPath, "utf-8"));
      results.push(raw as PluginManifest);
    } catch (e) {
      log.warn(`Failed to load plugin manifest ${dir}: ${e}`);
    }
  }
  return results;
}

/** Install a plugin from the registry */
export async function installPlugin(
  name: string,
  registryUrl: string,
  cwd?: string
): Promise<void> {
  const pluginsDir = workspacePath(PLUGINS_DIR, cwd);
  const targetDir = path.join(pluginsDir, name);

  if (fs.existsSync(targetDir)) {
    throw new Error(`Plugin "${name}" is already installed. Uninstall first.`);
  }

  log.info(`Fetching plugin "${name}" from ${registryUrl}...`);
  const { buffer, checksum } = await fetchPackage(name, "latest", registryUrl);

  // Verify SHA-256 checksum
  const computed = crypto.createHash("sha256").update(buffer).digest("hex");
  if (checksum && computed !== checksum) {
    throw new Error(`Checksum mismatch for "${name}": expected ${checksum}, got ${computed}`);
  }

  // Extract tarball (simplified: write buffer as tar.gz, extract with tar)
  fs.mkdirSync(targetDir, { recursive: true });
  const tarPath = path.join(targetDir, `${name}.tar.gz`);
  fs.writeFileSync(tarPath, buffer);

  const { execSync } = await import("node:child_process");
  execSync(`tar -xzf "${tarPath}" -C "${targetDir}" --strip-components=1`, { stdio: "pipe" });
  fs.unlinkSync(tarPath);

  log.success(`Plugin "${name}" installed to ${targetDir}`);
}

/** Uninstall a plugin by removing its directory */
export function uninstallPlugin(name: string, cwd?: string): void {
  const pluginsDir = workspacePath(PLUGINS_DIR, cwd);
  const targetDir = path.join(pluginsDir, name);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Plugin "${name}" is not installed.`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  log.success(`Plugin "${name}" uninstalled.`);
}

/** Load all tools/skills/agents from all installed plugins */
export function loadPluginArtifacts(cwd?: string): {
  tools: ToolDef[];
  skills: SkillConfig[];
  agents: AgentConfig[];
} {
  const plugins = loadInstalledPlugins(cwd);
  const tools: ToolDef[] = [];
  const skills: SkillConfig[] = [];
  const agents: AgentConfig[] = [];
  const pluginsDir = workspacePath(PLUGINS_DIR, cwd);

  for (const plugin of plugins) {
    const pluginDir = path.join(pluginsDir, plugin.name);

    // Load tools
    const toolsDir = path.join(pluginDir, "tools");
    if (fs.existsSync(toolsDir)) {
      for (const f of fs.readdirSync(toolsDir).filter((f) => f.endsWith(".tool.yaml"))) {
        try {
          const raw = parseYaml(fs.readFileSync(path.join(toolsDir, f), "utf-8"));
          tools.push(ToolDefSchema.parse(raw));
        } catch (e) {
          log.warn(`Plugin ${plugin.name}: failed to load tool ${f}: ${e}`);
        }
      }
    }

    // Load skills
    const skillsDir = path.join(pluginDir, "skills");
    if (fs.existsSync(skillsDir)) {
      for (const f of fs.readdirSync(skillsDir).filter((f) => f.endsWith(".skill.yaml"))) {
        try {
          const raw = parseYaml(fs.readFileSync(path.join(skillsDir, f), "utf-8"));
          skills.push(SkillConfigSchema.parse(raw));
        } catch (e) {
          log.warn(`Plugin ${plugin.name}: failed to load skill ${f}: ${e}`);
        }
      }
    }

    // Load agents
    const agentsDir = path.join(pluginDir, "agents");
    if (fs.existsSync(agentsDir)) {
      for (const f of fs.readdirSync(agentsDir).filter((f) => f.endsWith(".agent.yaml"))) {
        try {
          const raw = parseYaml(fs.readFileSync(path.join(agentsDir, f), "utf-8"));
          agents.push(AgentConfigSchema.parse(raw));
        } catch (e) {
          log.warn(`Plugin ${plugin.name}: failed to load agent ${f}: ${e}`);
        }
      }
    }
  }

  return { tools, skills, agents };
}
