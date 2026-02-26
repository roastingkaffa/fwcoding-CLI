import { z } from "zod";

export const ArtifactSchema = z.object({
  label: z.string(),
  path: z.string(),
  size_bytes: z.number().int(),
});

export const ToolResultSchema = z.object({
  tool: z.string(),
  command: z.string(),
  exit_code: z.number().int(),
  duration_ms: z.number(),
  log_file: z.string(),
  status: z.enum(["success", "fail"]),
  pattern_matched: z.string().optional(),
  artifacts: z.array(ArtifactSchema).optional(),
});

export const LLMCallRecordSchema = z.object({
  purpose: z.string(),
  model: z.string(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  duration_ms: z.number(),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const LLMTracingSchema = z.object({
  provider: z.string(),
  model: z.string(),
  calls: z.array(LLMCallRecordSchema),
  total_input_tokens: z.number().int(),
  total_output_tokens: z.number().int(),
  estimated_cost_usd: z.number().optional(),
});

export const HardwareStateSchema = z.object({
  serial_port: z.string(),
  debugger: z.string(),
  detected_device: z.string().optional(),
  flash_verified: z.boolean().optional(),
  connection_type: z.string().optional(),
});

export const BootStatusSchema = z.object({
  status: z.enum(["success", "fail", "unknown"]),
  matched_pattern: z.string().optional(),
  boot_time_ms: z.number().optional(),
});

export const ChangesSchema = z.object({
  files_changed: z.number().int(),
  lines_added: z.number().int(),
  lines_removed: z.number().int(),
  diff_path: z.string(),
  within_budget: z.boolean(),
});

export const MemoryAnalysisSchema = z.object({
  flash_used: z.number().int(),
  flash_total: z.number().int(),
  ram_used: z.number().int(),
  ram_total: z.number().int(),
  flash_percent: z.number(),
  ram_percent: z.number(),
});

export const ProjectContextSchema = z.object({
  name: z.string(),
  target_mcu: z.string(),
  arch: z.string().optional(),
  board: z.string().optional(),
  flash_size: z.string().optional(),
  ram_size: z.string().optional(),
  git_branch: z.string().optional(),
  git_commit: z.string().optional(),
});

export const EvidenceSchema = z.object({
  run_id: z.string(),
  skill: z.string().optional(),
  start_time: z.string(),
  end_time: z.string(),
  duration_ms: z.number(),
  status: z.enum(["success", "fail", "partial", "aborted"]),
  tools: z.array(ToolResultSchema),
  changes: ChangesSchema.optional(),
  memory: MemoryAnalysisSchema.optional(),
  hardware: HardwareStateSchema.optional(),
  boot_status: BootStatusSchema.optional(),
  llm: LLMTracingSchema.optional(),
  project: ProjectContextSchema,
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type LLMCallRecord = z.infer<typeof LLMCallRecordSchema>;
export type HardwareState = z.infer<typeof HardwareStateSchema>;
export type BootStatus = z.infer<typeof BootStatusSchema>;
export type Changes = z.infer<typeof ChangesSchema>;
