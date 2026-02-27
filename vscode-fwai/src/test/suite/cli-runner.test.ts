/**
 * Tests for cli-runner — CLI process spawning.
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("CliRunner", () => {
  const srcPath = path.join(__dirname, "../../lib/cli-runner.ts");

  it("module exports expected functions", () => {
    const src = fs.readFileSync(srcPath, "utf-8");
    assert.ok(src.includes("export function spawnFwai"));
    assert.ok(src.includes("export function runFwaiSkill"));
    assert.ok(src.includes("export function runFwaiCommand"));
  });

  it("FwaiRunResult interface has correct shape", () => {
    const src = fs.readFileSync(srcPath, "utf-8");
    assert.ok(src.includes("exitCode: number"));
    assert.ok(src.includes("stdout: string"));
    assert.ok(src.includes("stderr: string"));
    assert.ok(src.includes("json?: unknown"));
  });
});
