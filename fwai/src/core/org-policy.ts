import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Config, Policy } from "../schemas/config.schema.js";
import type { RunSession } from "./evidence.js";
import { globalTracer } from "../utils/llm-tracer.js";
import * as log from "../utils/logger.js";

export const OrgPolicySchema = z.object({
  id: z.string(),
  version: z.string(),
  inherits: z.string().optional(),
  overrides: z
    .object({
      protected_paths: z.array(z.string()).optional(),
      change_budget: z
        .object({
          max_files_changed: z.number().int().positive().optional(),
          max_lines_changed: z.number().int().positive().optional(),
        })
        .optional(),
      compliance_mode: z.enum(["none", "iso26262", "do178c", "iec62443"]).optional(),
      require_evidence: z.boolean().optional(),
      require_signing: z.boolean().optional(),
      require_sbom: z.boolean().optional(),
    })
    .default({}),
  required_compliance_mode: z.string().optional(),
  required_signing: z.boolean().default(false),
  required_sbom: z.boolean().default(false),
  max_llm_cost_per_run: z.number().positive().optional(),
  blocked_providers: z.array(z.string()).default([]),
  allowed_tools: z.array(z.string()).default([]),
  blocked_tools: z.array(z.string()).default([]),
});

export type OrgPolicy = z.infer<typeof OrgPolicySchema>;

/** Load org policy from local path or remote URL (with caching) */
export function loadOrgPolicy(config: Config, cwd: string): OrgPolicy | null {
  const orgCfg = config.org_policy;
  if (!orgCfg) return null;

  // Local path
  if (orgCfg.path) {
    const resolved = path.isAbsolute(orgCfg.path) ? orgCfg.path : path.resolve(cwd, orgCfg.path);
    if (fs.existsSync(resolved)) {
      return parseOrgPolicyFile(resolved);
    }
    log.warn(`Org policy path not found: ${resolved}`);
    return null;
  }

  // Remote URL — check cache first
  if (orgCfg.url) {
    const cachePath = path.join(cwd, ".fwai", "logs", "org-policy-cache.json");
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        const age = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
        if (age < (orgCfg.refresh_interval_sec ?? 3600)) {
          return OrgPolicySchema.parse(cached.policy);
        }
      } catch {
        /* stale cache */
      }
    }
    // Actual fetch would happen here in production — for now, return null
    log.debug(`Remote org policy fetch not yet implemented for: ${orgCfg.url}`);
    return null;
  }

  return null;
}

/** Parse a local org policy YAML/JSON file */
function parseOrgPolicyFile(filePath: string): OrgPolicy | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);
    return OrgPolicySchema.parse(data);
  } catch (e) {
    log.warn(`Failed to parse org policy: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Merge project-level policy with org policy (org overrides win, arrays union-merged) */
export function mergePolicy(projectPolicy: Policy, orgPolicy: OrgPolicy): Policy {
  const merged = { ...projectPolicy };
  const ov = orgPolicy.overrides;

  if (ov.protected_paths) {
    merged.protected_paths = [...new Set([...merged.protected_paths, ...ov.protected_paths])];
  }
  if (ov.change_budget) {
    merged.change_budget = { ...merged.change_budget, ...ov.change_budget };
  }
  if (ov.compliance_mode) merged.compliance_mode = ov.compliance_mode;
  if (ov.require_evidence !== undefined) merged.require_evidence = ov.require_evidence;
  if (ov.require_signing !== undefined) merged.require_signing = ov.require_signing;
  if (ov.require_sbom !== undefined) merged.require_sbom = ov.require_sbom;

  // Org-level tool lists
  if (orgPolicy.allowed_tools.length > 0) {
    merged.allowed_tools = [...new Set([...merged.allowed_tools, ...orgPolicy.allowed_tools])];
  }
  if (orgPolicy.blocked_tools.length > 0) {
    merged.blocked_tools = [...new Set([...merged.blocked_tools, ...orgPolicy.blocked_tools])];
  }
  if (orgPolicy.max_llm_cost_per_run !== undefined) {
    merged.max_llm_cost_per_run = orgPolicy.max_llm_cost_per_run;
  }

  return merged;
}

export interface PolicyValidationResult {
  violations: string[];
  blocked: boolean;
}

/** Validate a run session against the merged policy */
export function validateRunAgainstPolicy(
  session: RunSession,
  mergedPolicy: Policy
): PolicyValidationResult {
  const violations: string[] = [];

  // Check tool whitelist
  if (mergedPolicy.allowed_tools.length > 0) {
    for (const t of session.toolResults) {
      if (!mergedPolicy.allowed_tools.includes(t.tool)) {
        violations.push(`Tool '${t.tool}' not in allowed_tools whitelist`);
      }
    }
  }

  // Check tool blacklist
  if (mergedPolicy.blocked_tools.length > 0) {
    for (const t of session.toolResults) {
      if (mergedPolicy.blocked_tools.includes(t.tool)) {
        violations.push(`Tool '${t.tool}' is in blocked_tools blacklist`);
      }
    }
  }

  // Check LLM cost budget
  if (mergedPolicy.max_llm_cost_per_run !== undefined) {
    const cost = globalTracer.getEstimatedCost() ?? 0;
    if (cost > mergedPolicy.max_llm_cost_per_run) {
      violations.push(
        `LLM cost $${cost.toFixed(4)} exceeds budget $${mergedPolicy.max_llm_cost_per_run}`
      );
    }
  }

  // Check signing requirement
  if (mergedPolicy.require_signing) {
    violations.push("Signing is required by policy (will be applied at evidence write)");
  }

  return {
    violations,
    blocked: mergedPolicy.require_signing ? false : violations.length > 0, // signing is advisory
  };
}
