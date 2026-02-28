/**
 * Typed error classes for fwai.
 *
 * Hierarchy:
 *   FwaiError (base)
 *   ├── ProviderError        — LLM API errors (statusCode, provider, isRetryable)
 *   ├── ToolExecutionError   — Tool execution failures (toolName)
 *   ├── ConfigValidationError — Config/schema validation failures
 *   └── PolicyViolationError  — Safety policy violations (policyField)
 */

/** Base error for all fwai-specific errors */
export class FwaiError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "FwaiError";
    this.code = code;
  }
}

/** LLM provider API errors */
export class ProviderError extends FwaiError {
  readonly statusCode: number | undefined;
  readonly provider: string;

  /** HTTP status codes that are safe to retry */
  static readonly RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 529];

  constructor(message: string, statusCode: number | undefined, provider: string) {
    const code = statusCode ? `PROVIDER_${statusCode}` : "PROVIDER_ERROR";
    super(message, code);
    this.name = "ProviderError";
    this.statusCode = statusCode;
    this.provider = provider;
  }

  get isRetryable(): boolean {
    return (
      this.statusCode !== undefined &&
      ProviderError.RETRYABLE_STATUS_CODES.includes(this.statusCode)
    );
  }
}

/** Tool execution failures */
export class ToolExecutionError extends FwaiError {
  readonly toolName: string;

  constructor(message: string, toolName: string) {
    super(message, "TOOL_EXECUTION_ERROR");
    this.name = "ToolExecutionError";
    this.toolName = toolName;
  }
}

/** Config or schema validation failures */
export class ConfigValidationError extends FwaiError {
  constructor(message: string, field: string) {
    super(message, `CONFIG_INVALID_${field}`);
    this.name = "ConfigValidationError";
  }
}

/** Safety policy violations */
export class PolicyViolationError extends FwaiError {
  readonly policyField: string;

  constructor(message: string, policyField: string) {
    super(message, `POLICY_VIOLATION_${policyField}`);
    this.name = "PolicyViolationError";
    this.policyField = policyField;
  }
}
