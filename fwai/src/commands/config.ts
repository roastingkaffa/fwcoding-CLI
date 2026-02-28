import type { AppContext } from "../repl.js";
import * as log from "../utils/logger.js";

export async function handleConfig(_args: string, ctx: AppContext): Promise<void> {
  log.heading("\nCurrent Configuration:\n");
  log.line();
  console.log(`  Provider:    ${ctx.config.provider.name}`);
  console.log(`  Model:       ${ctx.config.provider.model}`);
  console.log(`  API Key Env: ${ctx.config.provider.api_key_env}`);
  console.log(`  Mode:        ${ctx.config.mode.default}`);
  console.log(`  Log Level:   ${ctx.config.logging.level}`);
  console.log("");
  console.log(`  Project:     ${ctx.project.project.name}`);
  console.log(`  MCU:         ${ctx.project.project.target.mcu}`);
  console.log(`  Board:       ${ctx.project.project.target.board ?? "(not set)"}`);
  console.log(
    `  Serial:      ${ctx.project.project.serial.port} @ ${ctx.project.project.serial.baud}`
  );
  log.line();
  console.log("");
}
