import type { SkillConfig } from "../schemas/skill.schema.js";
import type { IntentConfig } from "../schemas/config.schema.js";
import type { LLMProvider } from "../providers/provider.js";
import { globalTracer } from "../utils/llm-tracer.js";

export interface IntentResult {
  skill: string | null;
  confidence: number;
  source: "exact" | "keyword" | "llm";
  raw_response?: string;
}

/**
 * Three-tier intent resolution:
 * 1. Exact command match (e.g., input === skill name)
 * 2. Keyword trigger match from skill triggers[]
 * 3. LLM classification (fallback)
 */
export async function resolveIntent(
  input: string,
  skills: Map<string, SkillConfig>,
  config: IntentConfig,
  provider?: LLMProvider | null
): Promise<IntentResult> {
  const normalized = input.trim().toLowerCase();

  // Tier 1: Exact match
  if (skills.has(normalized)) {
    recordIntentTrace(input, normalized, 1.0, "exact");
    return { skill: normalized, confidence: 1.0, source: "exact" };
  }

  // Tier 2: Keyword trigger match
  let bestMatch: { name: string; triggerLength: number } | null = null;
  for (const [name, skill] of skills) {
    for (const trigger of skill.triggers ?? []) {
      const t = trigger.toLowerCase();
      if (normalized.includes(t)) {
        if (!bestMatch || t.length > bestMatch.triggerLength) {
          bestMatch = { name, triggerLength: t.length };
        }
      }
    }
  }
  if (bestMatch) {
    recordIntentTrace(input, bestMatch.name, 1.0, "keyword");
    return { skill: bestMatch.name, confidence: 1.0, source: "keyword" };
  }

  // Tier 3: LLM classification
  if (provider?.isReady()) {
    return await classifyWithLLM(input, skills, provider);
  }

  return { skill: null, confidence: 0, source: "llm" };
}

/** Build the LLM classification prompt */
function buildClassificationPrompt(skills: Map<string, SkillConfig>): string {
  const skillList = Array.from(skills.values())
    .map((s) => {
      const triggers = s.triggers?.join(", ") ?? "none";
      return `- ${s.name}: ${s.description ?? "(no description)"} (triggers: ${triggers})`;
    })
    .join("\n");

  return `You are a firmware development assistant. Given the user's request,
determine which skill to execute. Available skills:

${skillList}

Respond in this exact format (no other text):
SKILL_NAME|CONFIDENCE

Where CONFIDENCE is a number between 0.0 and 1.0 indicating how sure you are.
If no skill matches, respond with: none|0.0

Examples:
- "build and flash my board" → bringup|0.92
- "help me fix compile errors" → build-fix|0.85
- "what is the weather" → none|0.0
- "maybe do a bringup?" → bringup|0.65`;
}

/** Use LLM to classify user intent */
async function classifyWithLLM(
  input: string,
  skills: Map<string, SkillConfig>,
  provider: LLMProvider
): Promise<IntentResult> {
  const systemPrompt = buildClassificationPrompt(skills);
  const timer = globalTracer.startCall("intent_resolution");

  try {
    const response = await provider.complete({
      messages: [{ role: "user", content: input }],
      system: systemPrompt,
      max_tokens: 50,
      temperature: 0.1,
    });

    const result = parseIntentResponse(response.content);

    timer.finish(response.usage.input_tokens, response.usage.output_tokens, {
      user_input: input,
      resolved_skill: result.skill,
      confidence: result.confidence,
      source: "llm",
    });

    return result;
  } catch (err) {
    timer.finish(0, 0, { error: String(err) });
    // Safe fallback on LLM error
    return { skill: null, confidence: 0, source: "llm" };
  }
}

/** Parse LLM classification response: "skill_name|confidence" */
export function parseIntentResponse(raw: string): IntentResult {
  const match = raw.trim().match(/^([\w][\w-]*)\|(\d+\.?\d*)$/);
  if (!match) {
    return { skill: null, confidence: 0, source: "llm", raw_response: raw };
  }
  const [, skill, conf] = match;
  const confidence = Math.min(1, Math.max(0, parseFloat(conf)));
  return {
    skill: skill === "none" ? null : skill,
    confidence,
    source: "llm",
    raw_response: raw,
  };
}

/** Record intent resolution trace (for non-LLM tiers) */
function recordIntentTrace(input: string, skill: string, confidence: number, source: string): void {
  globalTracer.record({
    purpose: "intent_resolution",
    model: globalTracer.getModel() || "n/a",
    input_tokens: 0,
    output_tokens: 0,
    duration_ms: 0,
    timestamp: new Date().toISOString(),
    metadata: {
      user_input: input,
      resolved_skill: skill,
      confidence,
      source,
    },
  });
}
