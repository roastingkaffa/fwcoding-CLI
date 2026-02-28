import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import type { OTABundle, OTATarget, OTAPolicy } from "../schemas/ota.schema.js";
import * as log from "../utils/logger.js";

export interface OTAResult {
  device_id: string;
  status: "success" | "fail" | "skipped";
  boot_verified?: boolean;
  duration_ms: number;
  error?: string;
}

/** Build an OTA bundle from an ELF file */
export function buildOTABundle(
  elfPath: string,
  version: string,
  outputDir: string,
  cwd?: string
): OTABundle {
  const versionDir = path.join(outputDir, version);
  fs.mkdirSync(versionDir, { recursive: true });

  const binaryPath = path.join(versionDir, `firmware-${version}.bin`);
  const manifestPath = path.join(versionDir, "bundle.json");

  // Convert ELF to binary using objcopy
  const resolvedElf = cwd ? path.resolve(cwd, elfPath) : path.resolve(elfPath);
  try {
    execSync(
      `arm-none-eabi-objcopy -O binary "${resolvedElf}" "${binaryPath}"`,
      { stdio: "pipe", cwd }
    );
  } catch (err) {
    throw new Error(`objcopy failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Compute SHA-256
  const binary = fs.readFileSync(binaryPath);
  const checksum = crypto.createHash("sha256").update(binary).digest("hex");

  // Git info
  let gitCommit: string | undefined;
  let gitTag: string | undefined;
  try {
    gitCommit = execSync("git rev-parse HEAD", { stdio: "pipe", cwd }).toString().trim();
  } catch { /* not in git repo */ }
  try {
    gitTag = execSync("git describe --tags --exact-match 2>/dev/null", { stdio: "pipe", cwd }).toString().trim();
  } catch { /* no tag */ }

  const bundle: OTABundle = {
    version,
    elf_path: elfPath,
    binary_path: binaryPath,
    checksum,
    built_at: new Date().toISOString(),
    git_commit: gitCommit,
    git_tag: gitTag,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(bundle, null, 2));
  log.success(`OTA bundle ${version} created: ${binaryPath} (SHA-256: ${checksum.slice(0, 16)}...)`);

  return bundle;
}

/** List available bundles from the bundle directory */
export function listBundles(bundleDir: string): OTABundle[] {
  if (!fs.existsSync(bundleDir)) return [];

  const bundles: OTABundle[] = [];
  for (const dir of fs.readdirSync(bundleDir)) {
    const manifestPath = path.join(bundleDir, dir, "bundle.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      bundles.push(raw as OTABundle);
    } catch {
      // skip malformed bundles
    }
  }

  return bundles.sort((a, b) => a.version.localeCompare(b.version));
}

/** Deploy a bundle to a single target */
export async function deployToTarget(
  bundle: OTABundle,
  target: OTATarget,
  policy: OTAPolicy,
  confirm: (msg: string) => Promise<boolean>,
  cwd?: string
): Promise<OTAResult> {
  const start = Date.now();

  // Confirm if policy requires it
  if (policy.confirm) {
    const ok = await confirm(`Deploy ${bundle.version} to ${target.device_id} via ${target.transport}? (y/N) `);
    if (!ok) {
      return { device_id: target.device_id, status: "skipped", duration_ms: Date.now() - start };
    }
  }

  // Verify checksum if policy requires
  if (policy.require_checksum) {
    const binary = fs.readFileSync(bundle.binary_path);
    const computed = crypto.createHash("sha256").update(binary).digest("hex");
    if (computed !== bundle.checksum) {
      return {
        device_id: target.device_id,
        status: "fail",
        duration_ms: Date.now() - start,
        error: `Checksum mismatch: expected ${bundle.checksum}, got ${computed}`,
      };
    }
  }

  try {
    switch (target.transport) {
      case "serial": {
        execSync(
          `st-flash write "${bundle.binary_path}" 0x08000000`,
          { stdio: "pipe", cwd, timeout: 60000 }
        );
        break;
      }
      case "network": {
        const res = await fetch(target.endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: fs.readFileSync(bundle.binary_path),
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        break;
      }
      case "board-farm": {
        execSync(
          `board-farm flash --device "${target.device_id}" --binary "${bundle.binary_path}"`,
          { stdio: "pipe", cwd, timeout: 120000 }
        );
        break;
      }
      case "custom": {
        execSync(target.endpoint.replace("${binary}", bundle.binary_path), {
          stdio: "pipe",
          cwd,
          timeout: 120000,
        });
        break;
      }
    }

    return {
      device_id: target.device_id,
      status: "success",
      boot_verified: false,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      device_id: target.device_id,
      status: "fail",
      duration_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Deploy bundle to all targets */
export async function deployToAll(
  bundle: OTABundle,
  targets: OTATarget[],
  policy: OTAPolicy,
  confirm: (msg: string) => Promise<boolean>,
  cwd?: string
): Promise<OTAResult[]> {
  const results: OTAResult[] = [];
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    log.info(`[${i + 1}/${targets.length}] Deploying to ${target.device_id}...`);
    const result = await deployToTarget(bundle, target, policy, confirm, cwd);
    results.push(result);
    if (result.status === "success") {
      log.success(`  ${target.device_id}: deployed in ${result.duration_ms}ms`);
    } else if (result.status === "fail") {
      log.error(`  ${target.device_id}: ${result.error}`);
    } else {
      log.info(`  ${target.device_id}: skipped`);
    }
  }
  return results;
}

/** Rollback a device to a previous version */
export async function rollback(
  deviceId: string,
  previousVersion: string,
  bundleDir: string,
  targets: OTATarget[],
  policy: OTAPolicy,
  confirm: (msg: string) => Promise<boolean>,
  cwd?: string
): Promise<OTAResult> {
  const bundles = listBundles(bundleDir);
  const bundle = bundles.find((b) => b.version === previousVersion);
  if (!bundle) {
    return {
      device_id: deviceId,
      status: "fail",
      duration_ms: 0,
      error: `Bundle version ${previousVersion} not found`,
    };
  }

  const target = targets.find((t) => t.device_id === deviceId);
  if (!target) {
    return {
      device_id: deviceId,
      status: "fail",
      duration_ms: 0,
      error: `Target device ${deviceId} not found in configuration`,
    };
  }

  log.info(`Rolling back ${deviceId} to ${previousVersion}...`);
  return deployToTarget(bundle, target, policy, confirm, cwd);
}
