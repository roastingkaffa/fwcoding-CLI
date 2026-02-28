import { z } from "zod";
import { LicenseSchema, CloudConfigSchema } from "./license.schema.js";

export const ProviderConfigSchema = z.object({
  name: z.enum(["anthropic", "openai", "gemini", "local"]),
  model: z.string(),
  api_key_env: z.string(),
  max_tokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.2),
});

export const PolicySchema = z.object({
  protected_paths: z.array(z.string()).default([]),
  change_budget: z
    .object({
      max_files_changed: z.number().int().positive().default(5),
      max_lines_changed: z.number().int().positive().default(200),
    })
    .default({}),
  flash_guard: z
    .object({
      require_confirmation: z.boolean().default(true),
      require_build_success: z.boolean().default(true),
    })
    .default({}),
  require_evidence: z.boolean().default(true),
  audit_log: z
    .object({
      enabled: z.boolean().default(false),
      path: z.string().default(".fwai/logs/audit.jsonl"),
      max_size_mb: z.number().positive().default(50),
    })
    .optional(),
  compliance_mode: z
    .enum(["none", "iso26262", "do178c", "iec62443"])
    .default("none"),
  require_signing: z.boolean().default(false),
  require_sbom: z.boolean().default(false),
  allowed_tools: z.array(z.string()).default([]),
  blocked_tools: z.array(z.string()).default([]),
  max_llm_cost_per_run: z.number().positive().optional(),
});

export const IntentConfigSchema = z.object({
  confidence_threshold_auto: z.number().min(0).max(1).default(0.8),
  confidence_threshold_ask: z.number().min(0).max(1).default(0.6),
});

export const CIModeSchema = z.object({
  max_total_duration_sec: z.number().int().positive().default(600),
});

export const ModeSchema = z.object({
  default: z.enum(["interactive", "ci"]).default("interactive"),
  ci: CIModeSchema.default({}),
});

export const LoggingSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  color: z.boolean().default(true),
});

export const SecurityConfigSchema = z
  .object({
    secret_patterns: z.array(z.string()).default([]),
    redact_in_evidence: z.boolean().default(true),
    redact_in_logs: z.boolean().default(true),
    signing: z
      .object({
        enabled: z.boolean().default(false),
        key_path: z.string().default(".fwai/keys/evidence.key"),
        algorithm: z.literal("ed25519").default("ed25519"),
      })
      .optional(),
  })
  .optional();

export const OrgPolicyConfigSchema = z
  .object({
    url: z.string().optional(),
    path: z.string().optional(),
    enforce: z.boolean().default(true),
    refresh_interval_sec: z.number().int().positive().default(3600),
  })
  .optional();

export const ConfigSchema = z.object({
  version: z.string().default("1.0"),
  provider: ProviderConfigSchema,
  policy: PolicySchema.default({}),
  intent: IntentConfigSchema.default({}),
  mode: ModeSchema.default({}),
  logging: LoggingSchema.default({}),
  marketplace: z
    .object({
      registry_url: z.string().url().default("https://registry.fwai.dev"),
      auto_update: z.boolean().default(false),
      allowed_publishers: z.array(z.string()).default([]),
    })
    .optional(),
  license: LicenseSchema.optional(),
  cloud: CloudConfigSchema.optional(),
  plugins: z.array(z.string()).default([]),
  security: SecurityConfigSchema,
  org_policy: OrgPolicyConfigSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type IntentConfig = z.infer<typeof IntentConfigSchema>;
export type CIMode = z.infer<typeof CIModeSchema>;
export type Mode = z.infer<typeof ModeSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type OrgPolicyConfig = z.infer<typeof OrgPolicyConfigSchema>;
