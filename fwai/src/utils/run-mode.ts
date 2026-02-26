import type { Mode } from "../schemas/config.schema.js";

export type RunMode = "interactive" | "ci";

export interface RunModeOptions {
  ci?: boolean;
  interactive?: boolean;
  yes?: boolean;
}

/**
 * Resolve the effective run mode from config + CLI flags.
 * CLI flags always take priority over config.
 */
export function resolveRunMode(
  configMode: Mode,
  cliFlags: RunModeOptions
): RunMode {
  if (cliFlags.ci) return "ci";
  if (cliFlags.interactive) return "interactive";
  return configMode.default;
}

/** Check if we should prompt for confirmation (flash guard, etc.) */
export function shouldPromptUser(mode: RunMode, yesFlag?: boolean): boolean {
  if (mode === "ci") return !yesFlag;
  return true;
}

/** Check if interactive REPL is allowed */
export function isReplAllowed(mode: RunMode): boolean {
  return mode === "interactive";
}
