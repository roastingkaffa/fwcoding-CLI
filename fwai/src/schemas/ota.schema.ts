import { z } from "zod";

export const OTABundleSchema = z.object({
  version: z.string(),
  elf_path: z.string(),
  binary_path: z.string(),
  checksum: z.string(),
  built_at: z.string(),
  git_commit: z.string().optional(),
  git_tag: z.string().optional(),
});

export const OTATargetSchema = z.object({
  device_id: z.string(),
  transport: z.enum(["serial", "network", "board-farm", "custom"]),
  endpoint: z.string(),
  board_id: z.string().optional(),
});

export const OTAPolicySchema = z.object({
  require_build_success: z.boolean().default(true),
  require_checksum: z.boolean().default(true),
  rollback_on_boot_failure: z.boolean().default(false),
  max_retry: z.number().int().nonnegative().default(0),
  confirm: z.boolean().default(true),
});

export type OTABundle = z.infer<typeof OTABundleSchema>;
export type OTATarget = z.infer<typeof OTATargetSchema>;
export type OTAPolicy = z.infer<typeof OTAPolicySchema>;
