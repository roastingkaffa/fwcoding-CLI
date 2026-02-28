import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createScanner, scanEvidence } from "../../../src/core/secret-scanner.js";
import type { Evidence } from "../../../src/schemas/evidence.schema.js";

describe("secret-scanner", () => {
  it("redacts AWS access keys", () => {
    const scanner = createScanner();
    const result = scanner.scan("key=AKIAIOSFODNN7EXAMPLE");
    assert.ok(result.redactedCount > 0);
    assert.ok(result.clean.includes("[REDACTED:"));
    assert.ok(!result.clean.includes("AKIAIOSFODNN7EXAMPLE"));
  });

  it("redacts OpenAI-style API keys", () => {
    const scanner = createScanner();
    const result = scanner.scan("export OPENAI_KEY=sk-abcdefghijklmnopqrstuvwxyz123456");
    assert.ok(result.redactedCount > 0);
    assert.ok(!result.clean.includes("sk-abcdefghijklmnopqrstuvwxyz123456"));
  });

  it("supports custom patterns", () => {
    const scanner = createScanner(["MY_CUSTOM_\\d+"]);
    const result = scanner.scan("value=MY_CUSTOM_12345");
    assert.ok(result.redactedCount > 0);
    assert.ok(result.clean.includes("[REDACTED:custom]"));
  });

  it("does not false-positive on normal text", () => {
    const scanner = createScanner();
    const result = scanner.scan("Hello world, this is normal firmware code\nint main() { return 0; }");
    assert.equal(result.redactedCount, 0);
    assert.equal(result.clean, "Hello world, this is normal firmware code\nint main() { return 0; }");
  });

  it("scans evidence and preserves structure", () => {
    const scanner = createScanner();
    const evidence: Evidence = {
      run_id: "test-001",
      start_time: "2026-01-01T00:00:00.000Z",
      end_time: "2026-01-01T00:01:00.000Z",
      duration_ms: 60000,
      status: "success",
      tools: [
        {
          tool: "build",
          command: "cmake -DAPI_KEY=sk-abcdefghijklmnopqrstuvwxyz123456 .",
          exit_code: 0,
          duration_ms: 5000,
          log_file: "build.log",
          status: "success",
        },
      ],
      project: { name: "test", target_mcu: "STM32F407" },
    };
    const { evidence: redacted, redactedCount } = scanEvidence(evidence, scanner);
    assert.ok(redactedCount > 0);
    assert.ok(!redacted.tools[0].command.includes("sk-"));
    assert.equal(redacted.run_id, "test-001"); // structure preserved
    assert.equal(redacted.tools.length, 1);
  });
});
