/**
 * Typed error for LLM provider and HTTP failures.
 * `isRetryable` is true for 429 (rate limit) and 5xx (server) status codes.
 */
export class ProviderError extends Error {
  readonly statusCode: number | undefined;
  readonly provider: string;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    statusCode: number | undefined,
    provider: string,
  ) {
    super(message);
    this.name = "ProviderError";
    this.statusCode = statusCode;
    this.provider = provider;
    this.isRetryable =
      statusCode !== undefined &&
      (statusCode === 429 || (statusCode >= 500 && statusCode < 600));
  }
}
