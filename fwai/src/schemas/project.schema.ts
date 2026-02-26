import { z } from "zod";

export const BootPatternsSchema = z.object({
  success_patterns: z.array(z.string()).default(["System Ready"]),
  failure_patterns: z.array(z.string()).default(["PANIC", "Hard Fault"]),
});

export const TargetSchema = z.object({
  mcu: z.string(),
  arch: z.string().optional(),
  board: z.string().optional(),
  flash_size: z.string().optional(),
  ram_size: z.string().optional(),
});

export const BuildConfigSchema = z.object({
  system: z
    .enum(["cmake", "make", "west", "idf.py", "platformio", "keil", "iar"])
    .default("cmake"),
  build_dir: z.string().default("build"),
  source_dir: z.string().default("src"),
  entry_point: z.string().optional(),
});

export const SerialSchema = z.object({
  port: z.string().default("/dev/ttyUSB0"),
  baud: z.number().int().positive().default(115200),
});

export const ToolchainSchema = z.object({
  compiler: z.string().default("arm-none-eabi-gcc"),
  debugger: z.string().optional(),
  flasher: z.string().optional(),
});

export const ProjectSchema = z.object({
  project: z.object({
    name: z.string(),
    description: z.string().optional(),
    target: TargetSchema,
    build: BuildConfigSchema.default({}),
    serial: SerialSchema.default({}),
    boot: BootPatternsSchema.default({}),
    toolchain: ToolchainSchema.default({}),
  }),
});

export type Project = z.infer<typeof ProjectSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type BootPatterns = z.infer<typeof BootPatternsSchema>;
export type SerialConfig = z.infer<typeof SerialSchema>;
export type ToolchainConfig = z.infer<typeof ToolchainSchema>;
