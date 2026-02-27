import { z } from "zod";

export const MCPServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
  timeout_sec: z.number().int().positive().default(30),
});

export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  input_schema: z.record(z.unknown()),
});

export const MCPConfigSchema = z.object({
  servers: z.array(MCPServerConfigSchema).default([]),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type MCPTool = z.infer<typeof MCPToolSchema>;
export type MCPConfig = z.infer<typeof MCPConfigSchema>;
