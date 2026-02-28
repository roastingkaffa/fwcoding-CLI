import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FwaiError,
  ProviderError,
  ToolExecutionError,
  ConfigValidationError,
  PolicyViolationError,
} from "../../../src/utils/errors.js";

describe("FwaiError", () => {
  it("sets code and message", () => {
    const err = new FwaiError("something broke", "TEST_CODE");
    assert.equal(err.message, "something broke");
    assert.equal(err.code, "TEST_CODE");
    assert.equal(err.name, "FwaiError");
  });

  it("is instanceof Error", () => {
    const err = new FwaiError("test", "X");
    assert.ok(err instanceof Error);
    assert.ok(err instanceof FwaiError);
  });
});

describe("ProviderError", () => {
  it("isRetryable returns true for 429", () => {
    const err = new ProviderError("rate limited", 429, "anthropic");
    assert.equal(err.isRetryable, true);
    assert.equal(err.provider, "anthropic");
    assert.equal(err.code, "PROVIDER_429");
  });

  it("isRetryable returns true for 500, 502, 503, 529", () => {
    for (const status of [500, 502, 503, 529]) {
      const err = new ProviderError("server error", status, "openai");
      assert.equal(err.isRetryable, true, `expected ${status} to be retryable`);
    }
  });

  it("isRetryable returns false for 401", () => {
    const err = new ProviderError("unauthorized", 401, "anthropic");
    assert.equal(err.isRetryable, false);
  });

  it("isRetryable returns false for undefined statusCode", () => {
    const err = new ProviderError("not initialized", undefined, "anthropic");
    assert.equal(err.isRetryable, false);
    assert.equal(err.code, "PROVIDER_ERROR");
  });

  it("is instanceof Error and FwaiError", () => {
    const err = new ProviderError("test", 500, "test");
    assert.ok(err instanceof Error);
    assert.ok(err instanceof FwaiError);
    assert.ok(err instanceof ProviderError);
  });
});

describe("ToolExecutionError", () => {
  it("sets toolName and code", () => {
    const err = new ToolExecutionError("objcopy failed", "ota");
    assert.equal(err.toolName, "ota");
    assert.equal(err.code, "TOOL_EXECUTION_ERROR");
    assert.ok(err instanceof FwaiError);
    assert.ok(err instanceof Error);
  });
});

describe("ConfigValidationError", () => {
  it("sets code with field suffix", () => {
    const err = new ConfigValidationError("Board farm not configured", "BOARD_FARM");
    assert.equal(err.code, "CONFIG_INVALID_BOARD_FARM");
    assert.ok(err instanceof FwaiError);
    assert.ok(err instanceof Error);
  });
});

describe("PolicyViolationError", () => {
  it("sets policyField and code", () => {
    const err = new PolicyViolationError("LLM returned empty response", "llm_grouping");
    assert.equal(err.policyField, "llm_grouping");
    assert.equal(err.code, "POLICY_VIOLATION_llm_grouping");
    assert.ok(err instanceof FwaiError);
    assert.ok(err instanceof Error);
  });
});
