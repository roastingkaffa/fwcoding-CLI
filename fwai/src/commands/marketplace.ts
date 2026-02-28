import type { AppContext } from "../repl.js";
import { loadInstalledPlugins, installPlugin, uninstallPlugin } from "../core/plugin-loader.js";
import { searchRegistry, getPackageInfo } from "../core/plugin-registry.js";
import * as log from "../utils/logger.js";

const DEFAULT_REGISTRY = "https://registry.fwai.dev";

export async function handleMarketplace(args: string, ctx: AppContext): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0] || "list";
  const registryUrl = ctx.config.marketplace?.registry_url ?? DEFAULT_REGISTRY;

  if (sub === "search") {
    const query = parts.slice(1).join(" ");
    if (!query) {
      log.error("Usage: /marketplace search <query>");
      return;
    }
    try {
      const results = await searchRegistry(query, registryUrl);
      if (results.length === 0) {
        log.info("No plugins found.");
        return;
      }
      log.heading("Search Results");
      for (const pkg of results) {
        log.info(`  ${pkg.name}@${pkg.version} — ${pkg.description ?? "(no description)"}`);
      }
    } catch (err) {
      log.error(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  if (sub === "install") {
    const name = parts[1];
    if (!name) {
      log.error("Usage: /marketplace install <name>");
      return;
    }
    try {
      await installPlugin(name, registryUrl);
      log.success(`Plugin "${name}" installed successfully.`);
    } catch (err) {
      log.error(`Install failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  if (sub === "uninstall") {
    const name = parts[1];
    if (!name) {
      log.error("Usage: /marketplace uninstall <name>");
      return;
    }
    try {
      uninstallPlugin(name);
    } catch (err) {
      log.error(`Uninstall failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  if (sub === "list") {
    const plugins = loadInstalledPlugins();
    if (plugins.length === 0) {
      log.info("No plugins installed. Use /marketplace search to discover plugins.");
      return;
    }
    log.heading("Installed Plugins");
    for (const p of plugins) {
      log.info(`  ${p.name}@${p.version} — ${p.description ?? ""}`);
    }
    return;
  }

  if (sub === "info") {
    const name = parts[1];
    if (!name) {
      log.error("Usage: /marketplace info <name>");
      return;
    }
    try {
      const info = await getPackageInfo(name, registryUrl);
      log.heading(info.name);
      log.info(`Version:     ${info.version}`);
      log.info(`Author:      ${info.author ?? "unknown"}`);
      log.info(`Description: ${info.description ?? "-"}`);
      if (info.artifacts) {
        const { tools, skills, agents } = info.artifacts;
        log.info(
          `Artifacts:   ${tools.length} tools, ${skills.length} skills, ${agents.length} agents`
        );
      }
    } catch (err) {
      log.error(`Info failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  log.error(`Unknown marketplace subcommand: ${sub}. Use: search, install, uninstall, list, info`);
}
