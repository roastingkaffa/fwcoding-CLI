import type { LLMProvider } from "./provider.js";
import type { ProviderConfig } from "../schemas/config.schema.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import * as log from "../utils/logger.js";

/** Create and initialize an LLM provider from config */
export async function createProvider(
  config: ProviderConfig
): Promise<LLMProvider> {
  let provider: LLMProvider;

  switch (config.name) {
    case "anthropic":
      provider = new AnthropicProvider();
      break;
    case "openai":
      provider = new OpenAIProvider();
      break;
    default:
      log.warn(`Unknown provider "${config.name}", falling back to anthropic`);
      provider = new AnthropicProvider();
  }

  await provider.init({
    model: config.model,
    apiKeyEnv: config.api_key_env,
    maxTokens: config.max_tokens,
    temperature: config.temperature,
  });

  if (!provider.isReady()) {
    const status = provider.status();
    log.debug(`LLM provider not ready: ${status.error}`);
  }

  return provider;
}
