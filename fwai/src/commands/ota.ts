import type { AppContext } from "../repl.js";
import {
  buildOTABundle,
  listBundles,
  deployToTarget,
  deployToAll,
  rollback,
} from "../core/ota-manager.js";
import { isFeatureEnabled } from "../core/license-manager.js";
import { collectAllEvidence } from "../core/audit-export.js";
import * as log from "../utils/logger.js";

export async function handleOTA(args: string, ctx: AppContext): Promise<void> {
  if (!isFeatureEnabled("ota", ctx.license)) {
    log.error("OTA feature requires a team or enterprise license. Run /license activate <key>.");
    return;
  }

  const parts = args.trim().split(/\s+/);
  const sub = parts[0] || "list";

  const otaConfig = ctx.project.project.ota;
  const bundleDir = otaConfig?.bundle_dir ?? ".fwai/ota";
  const targets = otaConfig?.targets ?? [];
  const policy = otaConfig?.policy ?? {
    require_build_success: true,
    require_checksum: true,
    rollback_on_boot_failure: false,
    max_retry: 0,
    confirm: true,
  };

  if (sub === "bundle") {
    const version = extractFlag(parts, "--version") ?? `0.0.${Date.now()}`;
    const elfPath =
      extractFlag(parts, "--elf") ?? ctx.project.project.build.build_dir + "/firmware.elf";
    try {
      buildOTABundle(elfPath, version, bundleDir);
    } catch (err) {
      log.error(`Bundle creation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  if (sub === "deploy") {
    const bundles = listBundles(bundleDir);
    if (bundles.length === 0) {
      log.error("No bundles available. Create one with /ota bundle first.");
      return;
    }
    const latest = bundles[bundles.length - 1];
    const targetId = extractFlag(parts, "--target");
    const all = parts.includes("--all");

    if (all) {
      if (targets.length === 0) {
        log.error("No OTA targets configured in project.yaml.");
        return;
      }
      await deployToAll(latest, targets, policy, ctx.confirm);
    } else if (targetId) {
      const target = targets.find((t) => t.device_id === targetId);
      if (!target) {
        log.error(
          `Target "${targetId}" not found. Available: ${targets.map((t) => t.device_id).join(", ")}`
        );
        return;
      }
      const result = await deployToTarget(latest, target, policy, ctx.confirm);
      if (result.status === "success") {
        log.success(`Deployed ${latest.version} to ${targetId}`);
      } else {
        log.error(`Deploy failed: ${result.error}`);
      }
    } else {
      log.error("Usage: /ota deploy --target <id> or /ota deploy --all");
    }
    return;
  }

  if (sub === "status") {
    const evidence = collectAllEvidence();
    const otaRuns = evidence.filter((e) => e.ota);
    if (otaRuns.length === 0) {
      log.info("No OTA deployments recorded.");
      return;
    }
    log.heading("OTA Deployment History");
    for (const e of otaRuns.slice(-10)) {
      const tgt = e.ota!.targets.map((t) => `${t.device_id}:${t.status}`).join(", ");
      log.info(`  ${e.run_id} — v${e.ota!.bundle_version} → [${tgt}]`);
    }
    return;
  }

  if (sub === "rollback") {
    const deviceId = parts[1];
    const version = parts[2];
    if (!deviceId || !version) {
      log.error("Usage: /ota rollback <device-id> <version>");
      return;
    }
    const result = await rollback(deviceId, version, bundleDir, targets, policy, ctx.confirm);
    if (result.status === "success") {
      log.success(`Rolled back ${deviceId} to ${version}`);
    } else {
      log.error(`Rollback failed: ${result.error}`);
    }
    return;
  }

  if (sub === "list") {
    const bundles = listBundles(bundleDir);
    if (bundles.length === 0) {
      log.info("No OTA bundles found. Create one with /ota bundle.");
      return;
    }
    log.heading("Available Bundles");
    for (const b of bundles) {
      log.info(`  v${b.version} — ${b.built_at} (SHA-256: ${b.checksum.slice(0, 16)}...)`);
    }
    return;
  }

  log.error(`Unknown OTA subcommand: ${sub}. Use: bundle, deploy, status, rollback, list`);
}

function extractFlag(parts: string[], flag: string): string | null {
  const idx = parts.indexOf(flag);
  if (idx === -1 || idx + 1 >= parts.length) return null;
  return parts[idx + 1];
}
