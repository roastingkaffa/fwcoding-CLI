import fs from "node:fs";
import path from "node:path";
import { workspacePath } from "../utils/paths.js";
import * as log from "../utils/logger.js";

export interface LicenseStatus {
  valid: boolean;
  tier: "community" | "pro" | "team" | "enterprise";
  features: Set<string>;
  seatsAvailable?: number;
  expiresAt?: string;
  error?: string;
}

/** Feature tier requirements */
const FEATURE_TIERS: Record<string, string[]> = {
  plugins: ["pro", "team", "enterprise"],
  audit: ["team", "enterprise"],
  ota: ["team", "enterprise"],
  gdb: ["pro", "team", "enterprise"],
  cloud_sync: ["team", "enterprise"],
};

const LICENSE_CACHE_PATH = "logs/license-cache.json";

/** Validate a license key against the dashboard endpoint */
export async function validateLicense(key: string, endpoint?: string): Promise<LicenseStatus> {
  const url = endpoint ?? "https://api.fwai.dev/license/validate";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: key }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        valid: false,
        tier: "community",
        features: new Set(),
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = (await res.json()) as {
      valid: boolean;
      tier: string;
      features: string[];
      seats_available?: number;
      expires_at?: string;
    };

    return {
      valid: data.valid,
      tier: (data.tier as LicenseStatus["tier"]) ?? "community",
      features: new Set(data.features ?? []),
      seatsAvailable: data.seats_available,
      expiresAt: data.expires_at,
    };
  } catch (err) {
    return {
      valid: false,
      tier: "community",
      features: new Set(),
      error: `License validation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Load cached license status from .fwai/logs/license-cache.json */
export function loadCachedLicense(cwd?: string): LicenseStatus | null {
  try {
    const cachePath = workspacePath(LICENSE_CACHE_PATH, cwd);
    if (!fs.existsSync(cachePath)) return null;
    const raw = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    return {
      valid: raw.valid,
      tier: raw.tier ?? "community",
      features: new Set(raw.features ?? []),
      seatsAvailable: raw.seatsAvailable,
      expiresAt: raw.expiresAt,
      error: raw.error,
    };
  } catch {
    return null;
  }
}

/** Save license status to cache */
export function saveLicenseCache(status: LicenseStatus, cwd?: string): void {
  try {
    const cachePath = workspacePath(LICENSE_CACHE_PATH, cwd);
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      cachePath,
      JSON.stringify(
        {
          valid: status.valid,
          tier: status.tier,
          features: Array.from(status.features),
          seatsAvailable: status.seatsAvailable,
          expiresAt: status.expiresAt,
          cachedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch (err) {
    log.debug(`Failed to cache license: ${err}`);
  }
}

/** Clear the license cache */
export function clearLicenseCache(cwd?: string): void {
  try {
    const cachePath = workspacePath(LICENSE_CACHE_PATH, cwd);
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  } catch {
    // ignore
  }
}

/** Check if a specific feature is enabled by the license */
export function isFeatureEnabled(
  feature: string,
  status: LicenseStatus | null | undefined
): boolean {
  if (!status || !status.valid) {
    // Community tier — check if feature requires higher tier
    const requiredTiers = FEATURE_TIERS[feature];
    return !requiredTiers; // allowed if no tier requirement
  }

  // Check explicit feature list first
  if (status.features.has(feature)) return true;

  // Check tier-based access
  const requiredTiers = FEATURE_TIERS[feature];
  if (!requiredTiers) return true;
  return requiredTiers.includes(status.tier);
}
