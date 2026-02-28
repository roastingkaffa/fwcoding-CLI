import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRunSession, listRecentRuns } from "../../../src/core/evidence.js";

describe("createRunSession", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-test-"));
    // Create the .fwai/runs directory structure
    fs.mkdirSync(path.join(tmpDir, ".fwai", "runs"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a run directory", () => {
    const session = createRunSession("test", "bringup", tmpDir);
    assert.ok(session.runId);
    assert.ok(session.runDir);
    assert.ok(fs.existsSync(session.runDir));
    assert.ok(session.startTime instanceof Date);
    assert.deepStrictEqual(session.toolResults, []);
    assert.equal(session.skill, "bringup");
  });

  it("creates unique run IDs", () => {
    const s1 = createRunSession("a", undefined, tmpDir);
    const s2 = createRunSession("b", undefined, tmpDir);
    assert.notEqual(s1.runId, s2.runId);
  });
});

describe("listRecentRuns", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-test-"));
    const runsDir = path.join(tmpDir, ".fwai", "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    // Create some fake run directories with sortable names
    fs.mkdirSync(path.join(runsDir, "2026-01-01T00-00-00-aaa"));
    fs.mkdirSync(path.join(runsDir, "2026-01-02T00-00-00-bbb"));
    fs.mkdirSync(path.join(runsDir, "2026-01-03T00-00-00-ccc"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns runs in reverse order (most recent first)", () => {
    const runs = listRecentRuns(10, tmpDir);
    assert.ok(runs[0].includes("ccc"));
    assert.ok(runs[1].includes("bbb"));
    assert.ok(runs[2].includes("aaa"));
  });

  it("respects limit", () => {
    const runs = listRecentRuns(2, tmpDir);
    assert.equal(runs.length, 2);
    assert.ok(runs[0].includes("ccc"));
    assert.ok(runs[1].includes("bbb"));
  });

  it("returns empty array when no runs directory exists", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-empty-"));
    const runs = listRecentRuns(5, emptyDir);
    assert.deepStrictEqual(runs, []);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});
