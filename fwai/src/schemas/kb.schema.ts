import { z } from "zod";

export const KBDocumentSchema = z.object({
  path: z.string(),
  title: z.string(),
  content: z.string(),
  tokens_estimate: z.number().int().optional(),
});

export const KBConfigSchema = z.object({
  enabled: z.boolean().default(true),
  max_context_tokens: z.number().int().positive().default(4000),
  include: z.array(z.string()).default(["**/*.md", "**/*.txt"]),
  exclude: z.array(z.string()).default([]),
});

export type KBDocument = z.infer<typeof KBDocumentSchema>;
export type KBConfig = z.infer<typeof KBConfigSchema>;
