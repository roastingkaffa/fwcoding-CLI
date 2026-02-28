import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  withRetry,
  computeDelay,
  DEFAULT_RETRY_CONFIG,
} from "../../../src/utils/retry.js";
import type { RetryConfig } from "../../../src/utils/retry.js";

const noDelay: Partial<RetryConfig> = {
  initialDelayMs: 0,
  maxDelayMs: 0,
  jitter: false,
};

describe("withRetry", () => {
  it("succeeds on first try — returns value, no delay", async () => {
    const result = await withRetry(
      async () => 42,
      () => true,
      noDelay,
    );
    assert.equal(result, 42);
  });

  it("retries on retryable error — succeeds on 2nd attempt", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw new Error("transient");
        return "ok";
      },
      () => true,
      noDelay,
    );
    assert.equal(result, "ok");
    assert.equal(calls, 2);
  });

  it("fails fast on non-retryable error — no retry, rethrows", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            throw new Error("permanent");
          },
          () => false,
          noDelay,
        ),
      { message: "permanent" },
    );
    assert.equal(calls, 1);
  });

  it("exhausts maxAttempts — rethrows last error", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            throw new Error(`fail-${calls}`);
          },
          () => true,
          { ...noDelay, maxAttempts: 3 },
        ),
      { message: "fail-3" },
    );
    assert.equal(calls, 3);
  });

  it("calls onRetry callback with correct attempt and delay", async () => {
    const retries: { attempt: number; delay: number }[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls <= 2) throw new Error("retry me");
        return "done";
      },
      () => true,
      { ...noDelay, maxAttempts: 3 },
      (attempt, delay) => retries.push({ attempt, delay }),
    );
    assert.equal(retries.length, 2);
    assert.equal(retries[0].attempt, 1);
    assert.equal(retries[1].attempt, 2);
  });

  it("rethrows when shouldRetry itself throws", async () => {
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            throw new Error("original");
          },
          () => {
            throw new Error("shouldRetry threw");
          },
          noDelay,
        ),
      { message: "shouldRetry threw" },
    );
  });
});

describe("computeDelay", () => {
  const base: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 30000,
    jitter: false,
  };

  it("increases exponentially without jitter", () => {
    assert.equal(computeDelay(0, base), 1000); // 1000 * 2^0
    assert.equal(computeDelay(1, base), 2000); // 1000 * 2^1
    assert.equal(computeDelay(2, base), 4000); // 1000 * 2^2
    assert.equal(computeDelay(3, base), 8000); // 1000 * 2^3
  });

  it("caps at maxDelayMs", () => {
    const capped = { ...base, maxDelayMs: 3000 };
    assert.equal(computeDelay(0, capped), 1000);
    assert.equal(computeDelay(1, capped), 2000);
    assert.equal(computeDelay(2, capped), 3000); // capped, not 4000
    assert.equal(computeDelay(3, capped), 3000); // still capped
  });

  it("adds jitter within ±25% range", () => {
    const withJitter = { ...base, jitter: true };
    // Run many times and check bounds
    for (let i = 0; i < 100; i++) {
      const delay = computeDelay(0, withJitter);
      assert.ok(delay >= 750, `delay ${delay} < 750`);
      assert.ok(delay <= 1250, `delay ${delay} > 1250`);
    }
  });
});
