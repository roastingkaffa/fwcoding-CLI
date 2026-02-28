import type { AppContext } from "../repl.js";
import {
  validateLicense,
  saveLicenseCache,
  clearLicenseCache,
} from "../core/license-manager.js";
import * as log from "../utils/logger.js";

export async function handleLicense(args: string, ctx: AppContext): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0] || "status";

  if (sub === "status") {
    if (!ctx.license) {
      log.info("License: Community (free tier)");
      log.info("Upgrade at https://fwai.dev/pricing for plugins, audit, OTA, and more.");
      return;
    }
    log.heading("License Status");
    log.info(`Tier:     ${ctx.license.tier}`);
    log.info(`Valid:    ${ctx.license.valid}`);
    log.info(`Features: ${Array.from(ctx.license.features).join(", ") || "none"}`);
    if (ctx.license.expiresAt) log.info(`Expires:  ${ctx.license.expiresAt}`);
    if (ctx.license.seatsAvailable !== undefined) log.info(`Seats:    ${ctx.license.seatsAvailable}`);
    if (ctx.license.error) log.warn(`Warning:  ${ctx.license.error}`);
    return;
  }

  if (sub === "activate") {
    const key = parts[1];
    if (!key) {
      log.error("Usage: /license activate <key>");
      return;
    }
    log.info("Validating license...");
    const status = await validateLicense(key);
    if (status.valid) {
      saveLicenseCache(status);
      ctx.license = status;
      log.success(`License activated: ${status.tier} tier`);
      log.info(`Features: ${Array.from(status.features).join(", ") || "tier-based"}`);
    } else {
      log.error(`License validation failed: ${status.error ?? "Invalid key"}`);
    }
    return;
  }

  if (sub === "deactivate") {
    clearLicenseCache();
    ctx.license = undefined;
    log.success("License deactivated. Reverted to community tier.");
    return;
  }

  log.error(`Unknown license subcommand: ${sub}. Use: status, activate, deactivate`);
}
