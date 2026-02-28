import { z } from "zod";

export const LicenseSchema = z.object({
  license_key: z.string(),
  tier: z.enum(["community", "pro", "team", "enterprise"]).default("community"),
  seats: z.number().int().positive().optional(),
  expires_at: z.string().optional(),
  features: z.array(z.string()).default([]),
  issued_to: z.string().optional(),
});

export const CloudConfigSchema = z.object({
  dashboard_url: z.string().url(),
  sync_enabled: z.boolean().default(false),
  team_id: z.string().optional(),
});

export type License = z.infer<typeof LicenseSchema>;
export type CloudConfig = z.infer<typeof CloudConfigSchema>;
