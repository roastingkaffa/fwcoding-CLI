import { z } from "zod";

export const AgentConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: z.union([z.string(), z.literal("inherit")]).default("inherit"),
  system_prompt: z.string(),
  allowed_paths: z.array(z.string()).default([]),
  protected_paths: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  max_iterations: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
