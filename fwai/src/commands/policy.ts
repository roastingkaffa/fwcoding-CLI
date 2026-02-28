import type { AppContext } from "../repl.js";
import { loadOrgPolicy, mergePolicy, validateRunAgainstPolicy } from "../core/org-policy.js";
import * as log from "../utils/logger.js";

export async function handlePolicy(args: string, ctx: AppContext): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0] || "show";

  switch (sub) {
    case "show": {
      const orgPolicy = ctx.orgPolicy ?? loadOrgPolicy(ctx.config, process.cwd());
      const merged = orgPolicy ? mergePolicy(ctx.config.policy, orgPolicy) : ctx.config.policy;
      log.heading("Merged Policy");
      log.info(JSON.stringify(merged, null, 2));
      if (orgPolicy) {
        log.info(`\nOrg policy: ${orgPolicy.id} v${orgPolicy.version}`);
      } else {
        log.info("\nNo org policy loaded");
      }
      break;
    }
    case "validate": {
      const orgPolicy = ctx.orgPolicy ?? loadOrgPolicy(ctx.config, process.cwd());
      if (!orgPolicy) { log.info("No org policy configured"); return; }
      const merged = mergePolicy(ctx.config.policy, orgPolicy);
      // Validate current config against requirements
      const issues: string[] = [];
      if (orgPolicy.required_signing && !ctx.config.security?.signing?.enabled) {
        issues.push("Signing required by org policy but not enabled in config");
      }
      if (orgPolicy.required_sbom && !merged.require_sbom) {
        issues.push("SBOM required by org policy");
      }
      if (orgPolicy.required_compliance_mode && merged.compliance_mode !== orgPolicy.required_compliance_mode) {
        issues.push(`Compliance mode must be '${orgPolicy.required_compliance_mode}', got '${merged.compliance_mode}'`);
      }
      if (issues.length === 0) log.success("Config passes org policy validation");
      else for (const issue of issues) log.warn(`  ${issue}`);
      break;
    }
    case "refresh": {
      const orgPolicy = loadOrgPolicy(ctx.config, process.cwd());
      if (orgPolicy) {
        ctx.orgPolicy = orgPolicy;
        log.success(`Org policy refreshed: ${orgPolicy.id} v${orgPolicy.version}`);
      } else {
        log.warn("No org policy available to refresh");
      }
      break;
    }
    case "diff": {
      const orgPolicy = ctx.orgPolicy ?? loadOrgPolicy(ctx.config, process.cwd());
      if (!orgPolicy) { log.info("No org policy configured"); return; }
      log.heading("Org Policy Overrides");
      const ov = orgPolicy.overrides;
      if (Object.keys(ov).length === 0) {
        log.info("  No overrides defined");
      } else {
        log.info(JSON.stringify(ov, null, 2));
      }
      if (orgPolicy.blocked_tools.length > 0) log.info(`Blocked tools: ${orgPolicy.blocked_tools.join(", ")}`);
      if (orgPolicy.allowed_tools.length > 0) log.info(`Allowed tools: ${orgPolicy.allowed_tools.join(", ")}`);
      break;
    }
    default:
      log.info("Usage: /policy <show|validate|refresh|diff>");
  }
}
