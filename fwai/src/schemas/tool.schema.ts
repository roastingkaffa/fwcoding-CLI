import { z } from "zod";

export const StopConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("timeout"),
    value: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("match"),
    pattern: z.string(),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal("boot_patterns"),
    inherit: z.boolean().default(true),
  }),
]);

export const ArtifactDefSchema = z.object({
  path: z.string(),
  label: z.string(),
});

export const GuardSchema = z.object({
  require_confirmation: z.boolean().default(false),
  message: z.string().optional(),
});

export const ToolDefSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  command: z.string(),
  working_dir: z.string().default("."),
  timeout_sec: z.number().int().positive().default(120),
  requires: z.array(z.string()).optional(),
  guard: GuardSchema.optional(),
  variables: z.record(z.string()).optional(),
  success_patterns: z.array(z.string()).optional(),
  failure_patterns: z.array(z.string()).optional(),
  stop_conditions: z.array(StopConditionSchema).optional(),
  artifacts: z.array(ArtifactDefSchema).optional(),
});

export type ToolDef = z.infer<typeof ToolDefSchema>;
export type StopCondition = z.infer<typeof StopConditionSchema>;
