import type { AppContext } from "../repl.js";
import { commands } from "./index.js";
import * as log from "../utils/logger.js";

export async function handleHelp(_args: string, _ctx: AppContext): Promise<void> {
  log.heading("\nFirmware AI CLI — Commands\n");
  log.line();
  for (const cmd of commands) {
    const name = `/${cmd.name}`.padEnd(16);
    console.log(`  ${name}${cmd.description}`);
  }
  console.log(`  ${"/exit".padEnd(16)}Exit REPL`);
  log.line();
  console.log("\n  Type natural language to interact with AI.\n");
}
