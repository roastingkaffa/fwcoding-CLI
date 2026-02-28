import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  collectAllEvidence,
  exportAsJson,
  exportAsJsonLines,
  exportAsCsv,
  exportAsSarif,
  exportAsHtml,
  computeChainHash,
  appendToAuditLog,
} from "../../../src/core/audit-export.js";
import type { Evidence } from "../../../src/schemas/evidence.schema.js";

function makeEvidence(runId: string, status: Evidence["status"] = "success"): Evidence {
  return {
    run_id: runId,
    skill: "bringup",
    start_time: "2026-01-15T10:00:00.000Z",
    end_time: "2026-01-15T10:01:00.000Z",
    duration_ms: 60000,
    status,
    tools: [
      {
        tool: "build",
        command: "cmake --build .",
        exit_code: status === "success" ? 0 : 1,
        duration_ms: 30000,
        log_file: "build.log",
        status: status === "success" ? "success" : "fail",
      },
    ],
    project: { name: "test-project", target_mcu: "STM32F407" },
  };
}

describe("audit-export", () => {
  let tmpDir: string;
  let runsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-audit-test-"));
    runsDir = path.join(tmpDir, ".fwai", "runs");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeEvidence(runId: string, evidence: Evidence): void {
    const runDir = path.join(runsDir, runId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, "evidence.json"), JSON.stringify(evidence));
  }

  it("collects all evidence from runs directory", () => {
    writeEvidence("run-001", makeEvidence("run-001"));
    writeEvidence("run-002", makeEvidence("run-002", "fail"));
    const results = collectAllEvidence(undefined, tmpDir);
    assert.equal(results.length, 2);
  });

  it("filters evidence by status", () => {
    writeEvidence("run-001", makeEvidence("run-001"));
    writeEvidence("run-002", makeEvidence("run-002", "fail"));
    const results = collectAllEvidence({ status: "fail" }, tmpDir);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "fail");
  });

  it("exports as JSON", () => {
    const evidence = [makeEvidence("run-001")];
    const json = exportAsJson(evidence);
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 1);
  });

  it("exports as JSON Lines", () => {
    const evidence = [makeEvidence("run-001"), makeEvidence("run-002")];
    const lines = exportAsJsonLines(evidence).trim().split("\n");
    assert.equal(lines.length, 2);
    assert.ok(JSON.parse(lines[0]).run_id);
  });

  it("exports as CSV with header", () => {
    const evidence = [makeEvidence("run-001")];
    const csv = exportAsCsv(evidence);
    const lines = csv.trim().split("\n");
    assert.equal(lines[0], "run_id,skill,status,duration_ms,tool_count,files_changed,cost");
    assert.ok(lines[1].startsWith("run-001"));
  });

  it("exports as SARIF (failures only)", () => {
    const evidence = [makeEvidence("run-001"), makeEvidence("run-002", "fail")];
    const sarif = JSON.parse(exportAsSarif(evidence));
    assert.equal(sarif.version, "2.1.0");
    assert.equal(sarif.runs[0].results.length, 1); // Only the failed one
  });

  it("exports as HTML", () => {
    const evidence = [makeEvidence("run-001")];
    const html = exportAsHtml(evidence, "MyProject");
    assert.ok(html.includes("<html>"));
    assert.ok(html.includes("MyProject"));
    assert.ok(html.includes("run-001"));
  });

  it("computes deterministic chain hash", () => {
    const evidence = [makeEvidence("run-001"), makeEvidence("run-002")];
    const hash1 = computeChainHash(evidence);
    const hash2 = computeChainHash(evidence);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64); // SHA-256 hex
  });

  it("appends to audit log (JSONL)", () => {
    const logPath = path.join(tmpDir, "audit.jsonl");
    appendToAuditLog(makeEvidence("run-001"), logPath);
    appendToAuditLog(makeEvidence("run-002"), logPath);
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).run_id, "run-001");
  });
});
