import { z } from "zod";

export const BoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  mcu: z.string(),
  board: z.string().optional(),
  serial_port: z.string().optional(),
  debugger: z.string().optional(),
  status: z.enum(["available", "allocated", "offline"]).default("available"),
  tags: z.array(z.string()).default([]),
});

export const BoardFarmConfigSchema = z.object({
  enabled: z.boolean().default(false),
  url: z.string().optional(),
  api_key_env: z.string().optional(),
  default_timeout_sec: z.number().int().positive().default(300),
});

export const BoardAllocationSchema = z.object({
  board_id: z.string(),
  allocated_by: z.string(),
  allocated_at: z.string(),
  expires_at: z.string().optional(),
  run_id: z.string().optional(),
});

export type Board = z.infer<typeof BoardSchema>;
export type BoardFarmConfig = z.infer<typeof BoardFarmConfigSchema>;
export type BoardAllocation = z.infer<typeof BoardAllocationSchema>;
