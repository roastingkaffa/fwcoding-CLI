import { z } from "zod";

export const MarketplacePackageSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  registry: z.string().url().optional(),
  artifacts: z.object({
    tools: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
    agents: z.array(z.string()).default([]),
  }).default({}),
  checksum: z.string().optional(),
});

export type MarketplacePackage = z.infer<typeof MarketplacePackageSchema>;
