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
    expect(session.runId).toBeTruthy();
    expect(session.runDir).toBeTruthy();
    expect(fs.existsSync(session.runDir)).toBe(true);
    expect(session.startTime).toBeInstanceOf(Date);
    expect(session.toolResults).toEqual([]);
    expect(session.skill).toBe("bringup");
  });

  it("creates unique run IDs", () => {
    const s1 = createRunSession("a", undefined, tmpDir);
    const s2 = createRunSession("b", undefined, tmpDir);
    expect(s1.runId).not.toBe(s2.runId);
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
    expect(runs[0]).toContain("ccc");
    expect(runs[1]).toContain("bbb");
    expect(runs[2]).toContain("aaa");
  });

  it("respects limit", () => {
    const runs = listRecentRuns(2, tmpDir);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toContain("ccc");
    expect(runs[1]).toContain("bbb");
  });

  it("returns empty array when no runs directory exists", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-empty-"));
    const runs = listRecentRuns(5, emptyDir);
    expect(runs).toEqual([]);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});
