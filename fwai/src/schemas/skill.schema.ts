import { z } from "zod";

const ToolStepSchema = z.object({
  tool: z.string(),
  on_fail: z.enum(["abort", "continue", "retry"]).default("abort"),
  config: z.record(z.unknown()).optional(),
});

const EvidenceStepSchema = z.object({
  action: z.literal("evidence"),
  summary: z.boolean().optional(),
});

const LLMAnalyzeStepSchema = z.object({
  action: z.literal("llm_analyze"),
  input: z.string(),
  prompt: z.string(),
});

const AgenticStepSchema = z.object({
  action: z.literal("agentic"),
  goal: z.string(),
  agent: z.string().optional(),
  max_iterations: z.number().int().positive().optional(),
  tools: z.array(z.string()).optional(),
});

export const SkillStepSchema = z.union([
  ToolStepSchema,
  EvidenceStepSchema,
  LLMAnalyzeStepSchema,
  AgenticStepSchema,
]);

export const SkillConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  agent: z.string().optional(),
  steps: z.array(SkillStepSchema),
  triggers: z.array(z.string()).optional(),
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;
export type SkillStep = z.infer<typeof SkillStepSchema>;
