import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadKBDocuments, searchKB, formatKBContext } from "../../../src/core/kb-loader.js";

describe("loadKBDocuments", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-kb-test-"));
    const kbDir = path.join(tmpDir, ".fwai", "kb");
    fs.mkdirSync(kbDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads .md and .txt files from kb/", () => {
    const kbDir = path.join(tmpDir, ".fwai", "kb");
    fs.writeFileSync(path.join(kbDir, "notes.md"), "# Notes\nSome notes");
    fs.writeFileSync(path.join(kbDir, "readme.txt"), "Plain text doc");

    const docs = loadKBDocuments(tmpDir);
    assert.equal(docs.length, 2);
    assert.deepStrictEqual(docs.map((d) => d.path).sort(), ["notes.md", "readme.txt"]);
  });

  it("extracts title from markdown heading", () => {
    const kbDir = path.join(tmpDir, ".fwai", "kb");
    fs.writeFileSync(path.join(kbDir, "guide.md"), "# STM32F4 Guide\nContent here");

    const docs = loadKBDocuments(tmpDir);
    assert.equal(docs[0].title, "STM32F4 Guide");
  });

  it("uses filename as title when no heading", () => {
    const kbDir = path.join(tmpDir, ".fwai", "kb");
    fs.writeFileSync(path.join(kbDir, "notes.txt"), "Just plain text");

    const docs = loadKBDocuments(tmpDir);
    assert.equal(docs[0].title, "notes");
  });

  it("returns empty when no kb/ directory", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-empty-"));
    fs.mkdirSync(path.join(emptyDir, ".fwai"), { recursive: true });
    const docs = loadKBDocuments(emptyDir);
    assert.deepStrictEqual(docs, []);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it("respects exclude patterns", () => {
    const kbDir = path.join(tmpDir, ".fwai", "kb");
    fs.writeFileSync(path.join(kbDir, "include.md"), "# Include");
    fs.writeFileSync(path.join(kbDir, "exclude.md"), "# Exclude");

    const docs = loadKBDocuments(tmpDir, {
      enabled: true,
      max_context_tokens: 4000,
      include: ["**/*.md"],
      exclude: ["exclude.md"],
    });
    assert.equal(docs.length, 1);
    assert.equal(docs[0].path, "include.md");
  });
});

describe("searchKB", () => {
  const docs = [
    { path: "stm32.md", title: "STM32F4 Notes", content: "The STM32F4 uses ARM Cortex-M4 with FPU. Clock config is important.", tokens_estimate: 20 },
    { path: "spi.md", title: "SPI Driver Guide", content: "SPI peripheral driver implementation for STM32.", tokens_estimate: 15 },
    { path: "unrelated.md", title: "Git Workflow", content: "How to use git branches.", tokens_estimate: 10 },
  ];

  it("returns documents matching keywords sorted by score", () => {
    const results = searchKB("STM32 clock", docs);
    assert.ok(results.length > 0);
    assert.equal(results[0].path, "stm32.md"); // Best match
  });

  it("returns empty for no matches", () => {
    const results = searchKB("python machine learning", docs);
    assert.deepStrictEqual(results, []);
  });

  it("returns empty for empty query", () => {
    assert.deepStrictEqual(searchKB("", docs), []);
    assert.deepStrictEqual(searchKB("   ", docs), []);
  });

  it("returns empty for empty documents", () => {
    assert.deepStrictEqual(searchKB("test", []), []);
  });

  it("scores title matches higher", () => {
    const results = searchKB("SPI driver", docs);
    assert.equal(results[0].path, "spi.md");
  });
});

describe("formatKBContext", () => {
  it("formats documents as markdown sections", () => {
    const results = [
      { path: "test.md", title: "Test Doc", content: "Test content", tokens_estimate: 10, score: 5 },
    ];
    const formatted = formatKBContext(results);
    assert.ok(formatted.includes("## Knowledge Base Context"));
    assert.ok(formatted.includes("### Test Doc (test.md)"));
    assert.ok(formatted.includes("Test content"));
  });

  it("returns empty string for no results", () => {
    assert.equal(formatKBContext([]), "");
  });

  it("truncates when exceeding token budget", () => {
    const largeDoc = {
      path: "big.md",
      title: "Big Doc",
      content: "x".repeat(100_000),
      tokens_estimate: 25000,
      score: 10,
    };
    const formatted = formatKBContext([largeDoc], 1000);
    assert.ok(formatted.includes("truncated"));
  });
});
