import { z } from "zod";

export const KBDocumentSchema = z.object({
  path: z.string(),
  title: z.string(),
  content: z.string(),
  tokens_estimate: z.number().int().optional(),
});

export const KBEmbeddingSchema = z.object({
  path: z.string(),
  embedding: z.array(z.number()),
  model: z.string(),
  updated_at: z.string(),
});

export const KBIndexSchema = z.object({
  version: z.number().int().default(1),
  model: z.string(),
  embeddings: z.array(KBEmbeddingSchema),
  built_at: z.string(),
});

export const KBConfigSchema = z.object({
  enabled: z.boolean().default(true),
  max_context_tokens: z.number().int().positive().default(4000),
  include: z.array(z.string()).default(["**/*.md", "**/*.txt"]),
  exclude: z.array(z.string()).default([]),
  embedding_model: z.string().optional(),
  embedding_provider: z.enum(["openai", "ollama"]).optional(),
  semantic_weight: z.number().min(0).max(1).default(0.5),
});

export type KBDocument = z.infer<typeof KBDocumentSchema>;
export type KBConfig = z.infer<typeof KBConfigSchema>;
export type KBEmbedding = z.infer<typeof KBEmbeddingSchema>;
export type KBIndex = z.infer<typeof KBIndexSchema>;
