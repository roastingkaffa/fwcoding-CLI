/**
 * /provider [name] [model] — Show or switch LLM provider.
 *
 * No args: show current provider status.
 * With args: hot-switch to a new provider.
 */

import type { AppContext } from "../repl.js";
import { createProvider } from "../providers/provider-factory.js";
import { globalTracer } from "../utils/llm-tracer.js";
import * as log from "../utils/logger.js";

export async function handleProvider(args: string, ctx: AppContext): Promise<void> {
  const parts = args.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    // Show current status
    showProviderStatus(ctx);
    return;
  }

  const providerName = parts[0] as "anthropic" | "openai" | "gemini" | "local";
  const model = parts[1] ?? getDefaultModel(providerName);

  log.info(`Switching to ${providerName} (${model})...`);

  try {
    const newProvider = await createProvider({
      name: providerName,
      model,
      api_key_env: ctx.config.provider.api_key_env,
      max_tokens: ctx.config.provider.max_tokens,
      temperature: ctx.config.provider.temperature,
    });

    if (!newProvider.isReady()) {
      const status = newProvider.status();
      log.error(`Provider not ready: ${status.error ?? "unknown error"}`);
      log.info("Current provider unchanged.");
      return;
    }

    ctx.provider = newProvider;
    ctx.config.provider.name = providerName;
    ctx.config.provider.model = model;

    // Update tracer
    globalTracer.configure(providerName, model);

    log.success(`Switched to ${providerName} (${model})`);
  } catch (err) {
    log.error(`Failed to switch provider: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function showProviderStatus(ctx: AppContext): void {
  console.log("");
  log.heading("LLM Provider Status");

  if (ctx.provider?.isReady()) {
    const status = ctx.provider.status();
    log.success(`Provider: ${status.name}`);
    log.info(`  Model: ${status.model}`);
    log.info(`  Tool-calling: ${ctx.provider.supportsToolCalling() ? "yes" : "no"}`);
  } else {
    log.warn("No LLM provider configured or not ready.");
    if (ctx.provider) {
      const status = ctx.provider.status();
      log.info(`  Error: ${status.error ?? "unknown"}`);
    }
  }

  console.log("");
  log.info("Usage: /provider <name> [model]");
  log.info("  Names: anthropic, openai, gemini, local");
  console.log("");
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "openai":
      return "gpt-4o";
    case "gemini":
      return "gemini-pro";
    case "local":
      return "local";
    default:
      return "default";
  }
}
