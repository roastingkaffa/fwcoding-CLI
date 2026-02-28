import type { SkillConfig } from "../schemas/skill.schema.js";
import { loadSkills } from "../core/config-loader.js";

/** Load all skills and return a map by name */
export function loadSkillMap(cwd?: string): Map<string, SkillConfig> {
  const skills = loadSkills(cwd);
  const map = new Map<string, SkillConfig>();
  for (const skill of skills) {
    map.set(skill.name, skill);
  }
  return map;
}

/** Get a specific skill by name */
export function getSkill(name: string, cwd?: string): SkillConfig | undefined {
  const map = loadSkillMap(cwd);
  return map.get(name);
}
