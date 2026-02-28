import type { Policy } from "../schemas/config.schema.js";

/** Risk assessment result */
export interface BashValidation {
  allowed: boolean;
  reason?: string;
  risk: "safe" | "moderate" | "dangerous";
}

/** Patterns for dangerous commands that should be blocked or require confirmation */
const DANGEROUS_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\brm\s+(-[^\s]*)?-r/, reason: "Recursive file deletion" },
  { pattern: /\brm\s+(-[^\s]*)?-f/, reason: "Forced file deletion" },
  { pattern: /\brm\b.*\s+\/(?:\s|$)/, reason: "Delete root filesystem" },
  { pattern: /\bmkfs\b/, reason: "Filesystem format" },
  { pattern: /\bdd\b\s+.*of=\/dev\//, reason: "Raw device write" },
  { pattern: />\s*\/dev\/[sh]d/, reason: "Redirect to block device" },
  { pattern: /\bcurl\b.*\|\s*(sh|bash|zsh)/, reason: "Pipe remote script to shell" },
  { pattern: /\bwget\b.*\|\s*(sh|bash|zsh)/, reason: "Pipe remote script to shell" },
  { pattern: /\bchmod\b.*777/, reason: "World-writable permissions" },
  { pattern: /\b:(){ :\|:& };:/, reason: "Fork bomb" },
  { pattern: /\bshutdown\b/, reason: "System shutdown" },
  { pattern: /\breboot\b/, reason: "System reboot" },
  { pattern: /\bsystemctl\s+(stop|disable|mask)\b/, reason: "Disabling system service" },
  { pattern: /\b>\s*\/etc\//, reason: "Overwriting system config" },
  { pattern: /\bgit\s+push\b.*--force/, reason: "Force push to remote" },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: "Destructive git reset" },
];

/** Patterns for commands that are moderate risk */
const MODERATE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bsudo\b/, reason: "Elevated privileges" },
  { pattern: /\brm\b/, reason: "File deletion" },
  { pattern: /\bgit\s+push\b/, reason: "Push to remote" },
  { pattern: /\bnpm\s+publish\b/, reason: "Package publishing" },
  { pattern: /\bdocker\s+rm\b/, reason: "Docker container removal" },
  { pattern: /\bkill\b/, reason: "Process termination" },
];

/**
 * Validate a bash command against dangerous and moderate-risk patterns.
 * Returns whether the command is allowed and the risk level.
 */
export function validateBashCommand(command: string, policy?: Policy): BashValidation {
  // Check blocked tools in policy
  if (policy?.blocked_tools?.includes("bash")) {
    return { allowed: false, reason: "bash tool is blocked by policy", risk: "dangerous" };
  }

  // Check dangerous patterns — block by default
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason, risk: "dangerous" };
    }
  }

  // Check moderate patterns — allowed but flagged
  for (const { pattern, reason } of MODERATE_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: true, reason, risk: "moderate" };
    }
  }

  return { allowed: true, risk: "safe" };
}
