import type { AppContext } from "../repl.js";
import { loadSkillMap } from "../skills/skill-loader.js";
import * as log from "../utils/logger.js";

export async function handleSkills(_args: string, _ctx: AppContext): Promise<void> {
  const skills = loadSkillMap();

  if (skills.size === 0) {
    log.info("No skills configured. Add YAML files to .fwai/skills/");
    return;
  }

  log.heading("\nAvailable Skills:\n");
  log.line();
  for (const [name, skill] of skills) {
    const desc = skill.description ?? "";
    const steps = skill.steps.length;
    console.log(`  ${name.padEnd(16)} ${String(steps).padEnd(3)} steps  ${desc}`);
  }
  log.line();
  console.log("\n  Use `fwai run <skill>` or type skill name in REPL.\n");
}
