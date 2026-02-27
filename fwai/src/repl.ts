import readline from "node:readline";
import type { Config } from "./schemas/config.schema.js";
import type { Project } from "./schemas/project.schema.js";
import type { ToolDef } from "./schemas/tool.schema.js";
import type { ProjectContext } from "./utils/project-context.js";
import type { LLMProvider, Message } from "./providers/provider.js";
import type { ToolMessage } from "./providers/tool-types.js";
import type { RunMode } from "./utils/run-mode.js";
import { formatContextBlock } from "./utils/project-context.js";
import { globalTracer } from "./utils/llm-tracer.js";
import { routeCommand, commands } from "./commands/index.js";
import { resolveIntent } from "./skills/intent-resolver.js";
import { loadSkillMap } from "./skills/skill-loader.js";
import { runSkill } from "./skills/skill-runner.js";
import { runAgenticLoop } from "./agents/agentic-loop.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import { loadKBDocuments, searchKB, formatKBContext } from "./core/kb-loader.js";
import { startSpinner, updateSpinner, stopSpinner, succeedSpinner, failSpinner } from "./utils/ui.js";
import * as log from "./utils/logger.js";

export interface AppContext {
  config: Config;
  project: Project;
  tools: Map<string, ToolDef>;
  projectCtx: ProjectContext;
  provider: LLMProvider | null;
  variables: Record<string, unknown>;
  runMode: RunMode;
  cliFlags: { ci?: boolean; yes?: boolean; json?: boolean; quiet?: boolean };
  /** Shared confirm function — provided by REPL or CLI */
  confirm: (message: string) => Promise<boolean>;
}

/** Conversation history for multi-turn LLM interaction (supports both text-only and tool-calling) */
const conversationHistory: ToolMessage[] = [];

/** Start the interactive REPL */
export async function startRepl(ctx: AppContext): Promise<void> {
  // Tab completion for /commands
  const commandNames = commands.map((c) => `/${c.name}`).concat(["/exit", "/quit"]);
  const completer = (line: string): [string[], string] => {
    if (line.startsWith("/")) {
      const hits = commandNames.filter((c) => c.startsWith(line));
      return [hits.length ? hits : commandNames, line];
    }
    return [[], line];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "fwai> ",
    completer,
  });

  console.log("");
  log.heading("Firmware AI CLI v0.1.0");
  log.info(`Project: ${ctx.project.project.name} | MCU: ${ctx.project.project.target.mcu}`);
  if (ctx.provider?.isReady()) {
    log.info(`LLM: ${ctx.config.provider.name} (${ctx.config.provider.model})`);
  } else {
    log.warn("LLM not configured. Tool commands still work. Set API key or run /config.");
  }
  console.log('  Type /help for commands, or natural language to interact.\n');

  // Queue-based confirm: when a handler needs confirmation, it pulls the next
  // line from the queue instead of using rl.question (avoids piped stdin issues)
  let confirmResolver: ((answer: string) => void) | null = null;

  ctx.confirm = (message: string): Promise<boolean> => {
    process.stdout.write(message);
    return new Promise((resolve) => {
      confirmResolver = (answer: string) => {
        confirmResolver = null;
        resolve(answer.trim().toLowerCase() === "y");
      };
      // If there's already a queued line waiting, use it immediately
      if (queue.length > 0) {
        const next = queue.shift()!;
        confirmResolver(next);
      }
    });
  };

  rl.prompt();

  let processing = false;
  let exiting = false;
  let drainDone: (() => void) | null = null;
  const queue: string[] = [];

  async function processLine(input: string): Promise<void> {
    try {
      if (input.startsWith("/")) {
        const shouldExit = await routeCommand(input, ctx);
        if (shouldExit) {
          exiting = true;
          rl.close();
          return;
        }
      } else {
        await handleNaturalLanguage(input, ctx);
      }
    } catch (err) {
      log.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!exiting) rl.prompt();
  }

  async function drainQueue(): Promise<void> {
    if (processing) return;
    processing = true;
    while (queue.length > 0) {
      // If a handler is waiting for confirmation, feed next line to it
      if (confirmResolver) {
        const next = queue.shift()!;
        confirmResolver(next);
        // Wait a tick for the confirm promise to resolve before continuing
        await new Promise((r) => setTimeout(r, 0));
        continue;
      }
      const next = queue.shift()!;
      await processLine(next);
    }
    processing = false;
    if (drainDone) drainDone();
  }

  rl.on("line", (line) => {
    const input = line.trim();
    if (!input) {
      if (!confirmResolver) rl.prompt();
      return;
    }
    queue.push(input);
    drainQueue();
  });

  rl.on("close", async () => {
    // Wait for any in-flight command to finish
    if (processing) {
      await new Promise<void>((resolve) => { drainDone = resolve; });
    }
    console.log("\nGoodbye!");
    process.exit(0);
  });
}

async function handleNaturalLanguage(
  input: string,
  ctx: AppContext
): Promise<void> {
  // Try intent resolution (Tier 1: exact, Tier 2: keyword, Tier 3: LLM)
  const skills = loadSkillMap();
  const intent = await resolveIntent(input, skills, ctx.config.intent, ctx.provider);

  if (intent.skill) {
    const threshold = ctx.config.intent.confidence_threshold_auto;
    const askThreshold = ctx.config.intent.confidence_threshold_ask;

    if (intent.confidence >= threshold) {
      // High confidence → auto-execute skill
      log.info(`Matched skill: ${intent.skill} (confidence: ${intent.confidence.toFixed(2)}, source: ${intent.source})`);
      await executeSkillFromRepl(intent.skill, skills, ctx);
      return;
    }

    if (intent.confidence >= askThreshold) {
      // Medium confidence → ask user to confirm
      log.info(`Possible skill match: ${intent.skill} (confidence: ${intent.confidence.toFixed(2)})`);
      const confirmed = await ctx.confirm(`Did you mean: run '${intent.skill}' skill? (y/N) `);
      if (confirmed) {
        await executeSkillFromRepl(intent.skill, skills, ctx);
        return;
      }
      // User declined — fall through to free chat
    }
    // Low confidence — fall through to free chat
  }

  // Free-form LLM conversation
  if (!ctx.provider?.isReady()) {
    log.warn("LLM not configured. Set API key environment variable.");
    log.info("Tool commands (/build, /flash, /monitor) still work without LLM.");
    return;
  }

  // Build system prompt: project context + KB context + default agent prompt
  const contextBlock = formatContextBlock(ctx.projectCtx);
  let kbBlock = "";
  if (ctx.config.kb?.enabled !== false) {
    const kbDocs = loadKBDocuments(process.cwd(), ctx.config.kb);
    const kbResults = searchKB(input, kbDocs);
    if (kbResults.length > 0) {
      kbBlock = "\n\n" + formatKBContext(kbResults, ctx.config.kb?.max_context_tokens);
    }
  }
  const systemPrompt = `${contextBlock}${kbBlock}\n\nYou are a firmware development assistant. Help the user with firmware-related questions, debugging, and code analysis. Be concise and technical. You have access to tools for reading/writing files, searching code, and running shell commands. Use them when needed.`;

  // New path: agentic loop (tool-calling provider)
  if (ctx.provider.supportsToolCalling()) {
    try {
      const registry = ToolRegistry.createDefault(ctx.tools);
      let streamingStarted = false;
      startSpinner("Thinking...");
      const result = await runAgenticLoop(input, conversationHistory, {
        provider: ctx.provider,
        registry,
        systemPrompt,
        streaming: true,
        context: {
          cwd: process.cwd(),
          protectedPaths: ctx.config.policy.protected_paths,
        },
        maxTokens: ctx.config.provider.max_tokens,
        temperature: ctx.config.provider.temperature,
        onToolCall: (name, toolInput) => {
          if (streamingStarted) { process.stdout.write("\n"); streamingStarted = false; }
          stopSpinner();
          log.info(`Tool: ${name}(${summarizeInput(toolInput)})`);
          startSpinner(`Running ${name}...`);
        },
        onToolResult: (name, result, isError) => {
          stopSpinner();
          if (isError) {
            log.error(`Tool ${name} error: ${result.slice(0, 200)}`);
          } else {
            log.success(`Tool ${name} done (${result.length} chars)`);
          }
          startSpinner("Thinking...");
        },
        onTextOutput: (text) => {
          // Fallback for non-streaming responses
          stopSpinner();
          console.log("");
          console.log(text);
          console.log("");
        },
        onTextDelta: (delta) => {
          if (!streamingStarted) {
            stopSpinner();
            process.stdout.write("\n");
            streamingStarted = true;
          }
          process.stdout.write(delta);
        },
      });
      stopSpinner();
      if (streamingStarted) { process.stdout.write("\n\n"); }

      // Update conversation history with the full agentic conversation
      conversationHistory.length = 0;
      conversationHistory.push(...result.messages);
    } catch (err) {
      stopSpinner();
      log.error(`Agentic loop failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  // Legacy path: text-only chat (for providers without tool-calling)
  conversationHistory.push({ role: "user", content: input });

  const timer = globalTracer.startCall("free_chat");
  startSpinner("Thinking...");
  try {
    const response = await ctx.provider.complete({
      messages: conversationHistory.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : "",
      })),
      system: systemPrompt,
      max_tokens: ctx.config.provider.max_tokens,
      temperature: ctx.config.provider.temperature,
    });

    timer.finish(response.usage.input_tokens, response.usage.output_tokens);
    stopSpinner();

    // Add assistant response to history
    conversationHistory.push({ role: "assistant", content: response.content });

    // Display response
    console.log("");
    console.log(response.content);
    console.log("");
  } catch (err) {
    timer.finish(0, 0, { error: String(err) });
    stopSpinner();
    log.error(`LLM call failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Summarize tool input for display (keep it short) */
function summarizeInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const str = String(value);
    parts.push(`${key}: ${str.length > 60 ? str.slice(0, 60) + "..." : str}`);
  }
  return parts.join(", ");
}

/** Execute a skill from the REPL context */
async function executeSkillFromRepl(
  skillName: string,
  skills: Map<string, { name: string }>,
  ctx: AppContext
): Promise<void> {
  const { getSkill } = await import("./skills/skill-loader.js");
  const skill = getSkill(skillName);
  if (!skill) {
    log.error(`Skill "${skillName}" not found.`);
    return;
  }

  await runSkill(skill, {
    tools: ctx.tools,
    projectCtx: ctx.projectCtx,
    variables: ctx.variables,
    cwd: process.cwd(),
    bootPatterns: ctx.project.project.boot,
    runMode: ctx.runMode,
    cliFlags: ctx.cliFlags,
    confirm: ctx.confirm,
    hardwareProject: ctx.project.project,
    policy: ctx.config.policy,
    provider: ctx.provider,
  });
}
