import type { AppContext } from "../repl.js";
import { handleHelp } from "./help.js";
import { handleBuild } from "./build.js";
import { handleFlash } from "./flash.js";
import { handleMonitor } from "./monitor.js";
import { handleEvidence } from "./evidence.js";
import { handleAgents } from "./agents.js";
import { handleSkills } from "./skills.js";
import { handleConfig } from "./config.js";
import { handleDoctor } from "./doctor.js";
import { handleAgentChat } from "./agent-chat.js";
import { handleAudit } from "./audit.js";
import { handleLicense } from "./license.js";
import { handleMarketplace } from "./marketplace.js";
import { handleOTA } from "./ota.js";
import { handleDebug } from "./debug.js";
import * as log from "../utils/logger.js";

export interface CommandDef {
  name: string;
  description: string;
  handler: (args: string, ctx: AppContext) => Promise<void>;
}

export const commands: CommandDef[] = [
  { name: "help", description: "List all commands", handler: handleHelp },
  { name: "build", description: "Execute build tool, collect build.log", handler: handleBuild },
  { name: "flash", description: "Flash firmware to target (with confirmation)", handler: handleFlash },
  { name: "monitor", description: "Capture UART output to uart.log", handler: handleMonitor },
  { name: "evidence", description: "List recent runs or show run details", handler: handleEvidence },
  { name: "agents", description: "List configured agents", handler: handleAgents },
  { name: "skills", description: "List available skills", handler: handleSkills },
  { name: "config", description: "Show current configuration", handler: handleConfig },
  { name: "doctor", description: "Check toolchain & environment health", handler: handleDoctor },
  { name: "agent", description: "Start scoped agent chat (e.g., /agent bsp)", handler: handleAgentChat },
  { name: "audit", description: "Audit trail: export, verify, summary", handler: handleAudit },
  { name: "license", description: "License: status, activate, deactivate", handler: handleLicense },
  { name: "marketplace", description: "Plugin marketplace: search, install, uninstall, list, info", handler: handleMarketplace },
  { name: "ota", description: "OTA updates: bundle, deploy, status, rollback, list", handler: handleOTA },
  { name: "debug", description: "GDB/debug: run, registers, backtrace, openocd", handler: handleDebug },
];

const commandMap = new Map(commands.map((c) => [c.name, c]));

/** Route a /command to its handler */
export async function routeCommand(
  input: string,
  ctx: AppContext
): Promise<boolean> {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return false;

  const parts = trimmed.slice(1).split(/\s+/);
  const cmdName = parts[0];
  const args = parts.slice(1).join(" ");

  if (cmdName === "exit" || cmdName === "quit") {
    return true; // signal exit
  }

  const cmd = commandMap.get(cmdName);
  if (!cmd) {
    log.error(`Unknown command: /${cmdName}. Type /help for available commands.`);
    return false;
  }

  await cmd.handler(args, ctx);
  return false;
}
