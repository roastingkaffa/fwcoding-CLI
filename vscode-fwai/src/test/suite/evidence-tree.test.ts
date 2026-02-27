/**
 * Tests for evidence tree view data structure.
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("EvidenceTree", () => {
  const fixtureDir = path.join(__dirname, "../fixtures/.fwai");

  it("fixture evidence.json is valid", () => {
    const raw = fs.readFileSync(
      path.join(fixtureDir, "runs/run-001/evidence.json"),
      "utf-8"
    );
    const evidence = JSON.parse(raw);
    assert.strictEqual(evidence.run_id, "run-001");
    assert.strictEqual(evidence.status, "pass");
    assert.strictEqual(evidence.tool_results.length, 2);
    assert.strictEqual(evidence.tool_results[0].tool, "build");
    assert.strictEqual(evidence.tool_results[1].tool, "flash");
  });

  it("fixture config.yaml exists", () => {
    assert.ok(fs.existsSync(path.join(fixtureDir, "config.yaml")));
  });

  it("fixture project.yaml exists", () => {
    assert.ok(fs.existsSync(path.join(fixtureDir, "project.yaml")));
  });

  it("fixture skills exist", () => {
    assert.ok(fs.existsSync(path.join(fixtureDir, "skills/bringup.skill.yaml")));
  });

  it("fixture agents exist", () => {
    assert.ok(fs.existsSync(path.join(fixtureDir, "agents/debug-agent.agent.yaml")));
  });

  it("fixture tools exist", () => {
    assert.ok(fs.existsSync(path.join(fixtureDir, "tools/build.tool.yaml")));
  });
});
