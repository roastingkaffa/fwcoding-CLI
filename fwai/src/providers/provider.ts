export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: Message[];
  system?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface CompletionResponse {
  content: string;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

export interface ProviderStatus {
  name: string;
  ready: boolean;
  model: string;
  error?: string;
}

export interface LLMProvider {
  name: string;

  /** Initialize provider, validate API key */
  init(config: ProviderInitConfig): Promise<void>;

  /** Send messages, get completion */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /** Check if provider is configured and ready */
  isReady(): boolean;

  /** Get provider status info */
  status(): ProviderStatus;
}

export interface ProviderInitConfig {
  model: string;
  apiKeyEnv: string;
  maxTokens: number;
  temperature: number;
}
