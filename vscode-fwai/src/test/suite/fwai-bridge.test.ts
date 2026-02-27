/**
 * Tests for fwai-bridge — dynamic import wrapper.
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";

describe("FwaiBridge", () => {
  it("fwai/lib module can be dynamically imported", async () => {
    const lib = await import("fwai/lib");
    assert.strictEqual(typeof lib.loadConfig, "function");
    assert.strictEqual(typeof lib.loadProject, "function");
    assert.strictEqual(typeof lib.loadSkillMap, "function");
    assert.strictEqual(typeof lib.loadAgentMap, "function");
    assert.strictEqual(typeof lib.listRecentRuns, "function");
    assert.strictEqual(typeof lib.loadEvidence, "function");
    assert.strictEqual(typeof lib.workspaceExists, "function");
    assert.strictEqual(typeof lib.createProvider, "function");
    assert.strictEqual(typeof lib.runAgenticLoop, "function");
    assert.strictEqual(typeof lib.ToolRegistry, "function");
  });

  it("dynamic import returns the same module on repeated calls", async () => {
    const lib1 = await import("fwai/lib");
    const lib2 = await import("fwai/lib");
    assert.strictEqual(lib1, lib2);
  });

  it("lib exports core type-constructing functions", async () => {
    const lib = await import("fwai/lib");
    assert.strictEqual(typeof lib.buildProjectContext, "function");
    assert.strictEqual(typeof lib.formatContextBlock, "function");
    assert.strictEqual(typeof lib.parseSizeOutput, "function");
    assert.strictEqual(typeof lib.computeMemoryReport, "function");
    assert.strictEqual(typeof lib.createAgentLoopConfig, "function");
    assert.strictEqual(typeof lib.checkChangeBudget, "function");
    assert.strictEqual(typeof lib.checkProtectedPaths, "function");
  });
});
