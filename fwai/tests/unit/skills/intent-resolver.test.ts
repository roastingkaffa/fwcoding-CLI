import { resolveIntent, parseIntentResponse } from "../../../src/skills/intent-resolver.js";
import type { SkillConfig } from "../../../src/schemas/skill.schema.js";

function makeSkillMap(...entries: Array<{ name: string; triggers?: string[] }>): Map<string, SkillConfig> {
  const map = new Map<string, SkillConfig>();
  for (const e of entries) {
    map.set(e.name, {
      name: e.name,
      description: `${e.name} skill`,
      steps: [],
      triggers: e.triggers,
    } as SkillConfig);
  }
  return map;
}

describe("resolveIntent", () => {
  it("Tier 1: exact match returns confidence 1.0", async () => {
    const skills = makeSkillMap({ name: "bringup" }, { name: "diagnose" });
    const result = await resolveIntent("bringup", skills, {
      confidence_threshold_auto: 0.8,
      confidence_threshold_ask: 0.6,
    });
    expect(result.skill).toBe("bringup");
    expect(result.confidence).toBe(1.0);
    expect(result.source).toBe("exact");
  });

  it("Tier 1: case-insensitive exact match", async () => {
    const skills = makeSkillMap({ name: "bringup" });
    const result = await resolveIntent("BringUp", skills, {
      confidence_threshold_auto: 0.8,
      confidence_threshold_ask: 0.6,
    });
    // Note: exact match uses lowercase comparison
    expect(result.skill).toBe("bringup");
    expect(result.source).toBe("exact");
  });

  it("Tier 2: keyword trigger match", async () => {
    const skills = makeSkillMap(
      { name: "bringup", triggers: ["build and flash", "bringup"] },
      { name: "diagnose", triggers: ["debug", "diagnose"] }
    );
    const result = await resolveIntent("help me build and flash the board", skills, {
      confidence_threshold_auto: 0.8,
      confidence_threshold_ask: 0.6,
    });
    expect(result.skill).toBe("bringup");
    expect(result.confidence).toBe(1.0);
    expect(result.source).toBe("keyword");
  });

  it("Tier 2: picks longest matching trigger", async () => {
    const skills = makeSkillMap(
      { name: "build-fix", triggers: ["fix build"] },
      { name: "bringup", triggers: ["build"] }
    );
    const result = await resolveIntent("fix build errors please", skills, {
      confidence_threshold_auto: 0.8,
      confidence_threshold_ask: 0.6,
    });
    expect(result.skill).toBe("build-fix");
  });

  it("fallback with no provider returns null skill", async () => {
    const skills = makeSkillMap({ name: "bringup", triggers: ["bringup"] });
    const result = await resolveIntent("what is the weather", skills, {
      confidence_threshold_auto: 0.8,
      confidence_threshold_ask: 0.6,
    });
    expect(result.skill).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.source).toBe("llm");
  });

  it("fallback with null provider returns null skill", async () => {
    const skills = makeSkillMap({ name: "bringup" });
    const result = await resolveIntent("random question", skills, {
      confidence_threshold_auto: 0.8,
      confidence_threshold_ask: 0.6,
    }, null);
    expect(result.skill).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

describe("parseIntentResponse", () => {
  it("parses valid response", () => {
    const result = parseIntentResponse("bringup|0.92");
    expect(result.skill).toBe("bringup");
    expect(result.confidence).toBeCloseTo(0.92);
    expect(result.source).toBe("llm");
  });

  it("parses 'none' as null skill", () => {
    const result = parseIntentResponse("none|0.0");
    expect(result.skill).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("clamps confidence to [0, 1]", () => {
    const result = parseIntentResponse("bringup|1.5");
    expect(result.confidence).toBe(1);
  });

  it("returns null skill for unparseable response", () => {
    const result = parseIntentResponse("I think you should run bringup");
    expect(result.skill).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.raw_response).toBe("I think you should run bringup");
  });

  it("handles skill names with hyphens", () => {
    const result = parseIntentResponse("build-fix|0.85");
    expect(result.skill).toBe("build-fix");
    expect(result.confidence).toBeCloseTo(0.85);
  });

  it("handles integer confidence", () => {
    const result = parseIntentResponse("bringup|1");
    expect(result.skill).toBe("bringup");
    expect(result.confidence).toBe(1);
  });
});
