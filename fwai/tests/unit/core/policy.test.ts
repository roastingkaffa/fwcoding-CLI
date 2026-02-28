import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isProtectedPath,
  checkProtectedPaths,
  generateSmartSplitSuggestions,
  type FileChange,
} from "../../../src/core/policy.js";
import type { LLMProvider, CompletionResponse } from "../../../src/providers/provider.js";

describe("isProtectedPath", () => {
  const protectedPaths = ["boot/**", "*.ld", "src/critical/**"];

  it("matches glob pattern boot/**", () => {
    assert.equal(isProtectedPath("boot/startup.s", protectedPaths), true);
    assert.equal(isProtectedPath("boot/vectors.c", protectedPaths), true);
  });

  it("matches *.ld pattern", () => {
    assert.equal(isProtectedPath("linker.ld", protectedPaths), true);
    assert.equal(isProtectedPath("STM32F407.ld", protectedPaths), true);
  });

  it("matches nested protected paths", () => {
    assert.equal(isProtectedPath("src/critical/init.c", protectedPaths), true);
  });

  it("does not match non-protected paths", () => {
    assert.equal(isProtectedPath("src/main.c", protectedPaths), false);
    assert.equal(isProtectedPath("src/drivers/spi.c", protectedPaths), false);
    assert.equal(isProtectedPath("Makefile", protectedPaths), false);
  });

  it("returns false for empty protected paths", () => {
    assert.equal(isProtectedPath("boot/startup.s", []), false);
  });
});

describe("checkProtectedPaths", () => {
  const protectedPaths = ["boot/**", "*.ld"];

  it("filters changed files to only protected ones", () => {
    const changedFiles = [
      "src/main.c",
      "boot/startup.s",
      "linker.ld",
      "src/app.c",
    ];
    const protected_ = checkProtectedPaths(changedFiles, protectedPaths);
    assert.deepStrictEqual(protected_, ["boot/startup.s", "linker.ld"]);
  });

  it("returns empty array when no files are protected", () => {
    const changedFiles = ["src/main.c", "src/app.c"];
    const protected_ = checkProtectedPaths(changedFiles, protectedPaths);
    assert.deepStrictEqual(protected_, []);
  });

  it("returns empty for empty changed files", () => {
    assert.deepStrictEqual(checkProtectedPaths([], protectedPaths), []);
  });

  it("returns empty for empty protected paths", () => {
    const changedFiles = ["boot/startup.s", "linker.ld"];
    assert.deepStrictEqual(checkProtectedPaths(changedFiles, []), []);
  });
});

describe("generateSmartSplitSuggestions", () => {
  const testFiles: FileChange[] = [
    { file: "src/drivers/spi.c", added: 40, removed: 10 },
    { file: "src/drivers/spi.h", added: 15, removed: 5 },
    { file: "src/app/main.c", added: 30, removed: 20 },
    { file: "src/app/config.h", added: 10, removed: 2 },
  ];

  function makeMockProvider(response: string): LLMProvider {
    return {
      name: "mock",
      init: async () => {},
      complete: async (): Promise<CompletionResponse> => ({
        content: response,
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
      }),
      isReady: () => true,
      status: () => ({ name: "mock", ready: true, model: "mock-1" }),
      supportsToolCalling: () => false,
    };
  }

  it("uses LLM response when provider returns valid JSON", async () => {
    const llmResponse = JSON.stringify([
      { label: "SPI driver", files: ["src/drivers/spi.c", "src/drivers/spi.h"] },
      { label: "App core", files: ["src/app/main.c", "src/app/config.h"] },
    ]);
    const provider = makeMockProvider(llmResponse);

    const result = await generateSmartSplitSuggestions(testFiles, 100, provider);

    assert.equal(result.length, 2);
    assert.equal(result[0].label, "SPI driver");
    assert.deepStrictEqual(result[0].files, ["src/drivers/spi.c", "src/drivers/spi.h"]);
    assert.equal(result[0].lines, 70); // 40+10 + 15+5
    assert.equal(result[1].label, "App core");
    assert.equal(result[1].lines, 62); // 30+20 + 10+2
  });

  it("falls back to directory-based when LLM returns malformed JSON", async () => {
    const provider = makeMockProvider("not valid json {{{");

    const result = await generateSmartSplitSuggestions(testFiles, 100, provider);

    // Should fall back to directory-based (grouped by top-level dir)
    assert.ok(result.length > 0);
    // All files accounted for
    const allFiles = result.flatMap((s) => s.files);
    assert.deepStrictEqual(allFiles.sort(), testFiles.map((f) => f.file).sort());
  });

  it("falls back to directory-based when LLM misses a file", async () => {
    const llmResponse = JSON.stringify([
      { label: "SPI driver", files: ["src/drivers/spi.c", "src/drivers/spi.h"] },
      // Missing src/app/config.h
      { label: "App core", files: ["src/app/main.c"] },
    ]);
    const provider = makeMockProvider(llmResponse);

    const result = await generateSmartSplitSuggestions(testFiles, 100, provider);

    // Should fall back since a file is missing
    const allFiles = result.flatMap((s) => s.files);
    assert.deepStrictEqual(allFiles.sort(), testFiles.map((f) => f.file).sort());
  });

  it("falls back to directory-based when provider throws", async () => {
    const provider: LLMProvider = {
      name: "mock",
      init: async () => {},
      complete: async () => { throw new Error("API error"); },
      isReady: () => true,
      status: () => ({ name: "mock", ready: true, model: "mock-1" }),
      supportsToolCalling: () => false,
    };

    const result = await generateSmartSplitSuggestions(testFiles, 100, provider);

    assert.ok(result.length > 0);
    const allFiles = result.flatMap((s) => s.files);
    assert.deepStrictEqual(allFiles.sort(), testFiles.map((f) => f.file).sort());
  });

  it("uses directory-based splitting when no provider given", async () => {
    const result = await generateSmartSplitSuggestions(testFiles, 100);

    assert.ok(result.length > 0);
    const allFiles = result.flatMap((s) => s.files);
    assert.deepStrictEqual(allFiles.sort(), testFiles.map((f) => f.file).sort());
  });

  it("uses directory-based splitting when provider is not ready", async () => {
    const provider: LLMProvider = {
      name: "mock",
      init: async () => {},
      complete: async (): Promise<CompletionResponse> => ({
        content: "[]",
        usage: { input_tokens: 0, output_tokens: 0 },
        stop_reason: "end_turn",
      }),
      isReady: () => false,
      status: () => ({ name: "mock", ready: false, model: "mock-1" }),
      supportsToolCalling: () => false,
    };

    const result = await generateSmartSplitSuggestions(testFiles, 100, provider);

    assert.ok(result.length > 0);
    // complete() should NOT have been called since isReady() is false
    const allFiles = result.flatMap((s) => s.files);
    assert.deepStrictEqual(allFiles.sort(), testFiles.map((f) => f.file).sort());
  });

  it("returns directory-based for empty file list", async () => {
    const provider = makeMockProvider("[]");
    const result = await generateSmartSplitSuggestions([], 100, provider);
    assert.deepStrictEqual(result, []);
  });
});
