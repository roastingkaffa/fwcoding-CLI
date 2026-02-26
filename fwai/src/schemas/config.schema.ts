import { z } from "zod";

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

export const ConfigSchema = z.object({
  version: z.string().default("1.0"),
  provider: ProviderConfigSchema,
  policy: PolicySchema.default({}),
  intent: IntentConfigSchema.default({}),
  mode: ModeSchema.default({}),
  logging: LoggingSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type IntentConfig = z.infer<typeof IntentConfigSchema>;
export type CIMode = z.infer<typeof CIModeSchema>;
export type Mode = z.infer<typeof ModeSchema>;
