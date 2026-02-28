export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Retry a function with exponential backoff.
 *
 * @param fn          The async function to execute.
 * @param shouldRetry Predicate — return true to retry, false (or throw) to fail fast.
 * @param config      Partial overrides for retry timing.
 * @param onRetry     Optional callback invoked before each retry sleep.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (err: unknown) => boolean,
  config?: Partial<RetryConfig>,
  onRetry?: (attempt: number, delay: number, err: unknown) => void,
): Promise<T> {
  const cfg: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Non-retryable — fail immediately
      if (!shouldRetry(err)) throw err;

      // Exhausted all attempts
      if (attempt + 1 >= cfg.maxAttempts) break;

      const delay = computeDelay(attempt, cfg);
      onRetry?.(attempt + 1, delay, err);
      await sleep(delay);
    }
  }

  throw lastError;
}

/** Exponential backoff: min(initial * multiplier^attempt, maxDelay) ± 25% jitter */
export function computeDelay(attempt: number, config: RetryConfig): number {
  const base = Math.min(
    config.initialDelayMs * config.backoffMultiplier ** attempt,
    config.maxDelayMs,
  );
  if (!config.jitter) return base;
  const jitterFactor = 0.75 + Math.random() * 0.5; // ±25%
  return Math.round(base * jitterFactor);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
