import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runSkill } from "../../../src/skills/skill-runner.js";
import type { SkillConfig } from "../../../src/schemas/skill.schema.js";
import type { ToolDef } from "../../../src/schemas/tool.schema.js";
import type { SkillRunnerDeps } from "../../../src/skills/skill-runner.js";

function makeFakeToolDef(name: string, command = "echo ok"): ToolDef {
  return {
    name,
    description: `Mock ${name}`,
    command,
    working_dir: ".",
    timeout_sec: 10,
  } as ToolDef;
}

function makeBaseDeps(tmpDir: string): SkillRunnerDeps {
  return {
    tools: new Map<string, ToolDef>(),
    projectCtx: {
      name: "test-project",
      mcu: "STM32F407VG",
      arch: "arm",
      board: "custom",
      compiler: "arm-none-eabi-gcc",
      build_system: "cmake",
    },
    variables: {},
    cwd: tmpDir,
    runMode: "interactive",
  };
}

describe("runSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-skill-test-"));
    fs.mkdirSync(path.join(tmpDir, ".fwai", "runs"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("executes steps sequentially and returns session", async () => {
    const buildTool = makeFakeToolDef("build", "echo 'build ok'");
    const deps = makeBaseDeps(tmpDir);
    deps.tools.set("build", buildTool);

    const skill: SkillConfig = {
      name: "test-skill",
      description: "Test",
      steps: [
        { tool: "build", on_fail: "continue" },
      ],
    };

    const session = await runSkill(skill, deps);
    assert.ok(session.runId);
    assert.equal(session.skill, "test-skill");
    assert.equal(session.toolResults.length, 1);
  });

  it("aborts on step failure when on_fail is abort", async () => {
    const failTool = makeFakeToolDef("build", "exit 1");
    const nextTool = makeFakeToolDef("flash", "echo flash");
    const deps = makeBaseDeps(tmpDir);
    deps.tools.set("build", failTool);
    deps.tools.set("flash", nextTool);

    const skill: SkillConfig = {
      name: "abort-skill",
      description: "Test abort",
      steps: [
        { tool: "build", on_fail: "abort" },
        { tool: "flash", on_fail: "continue" },
      ],
    };

    const session = await runSkill(skill, deps);
    // Flash should NOT have run because build failed with abort
    assert.equal(session.toolResults.length, 1);
    assert.equal(session.toolResults[0].tool, "build");
  });

  it("continues on step failure when on_fail is continue", async () => {
    const failTool = makeFakeToolDef("build", "exit 1");
    const nextTool = makeFakeToolDef("flash", "echo flash-ok");
    const deps = makeBaseDeps(tmpDir);
    deps.tools.set("build", failTool);
    deps.tools.set("flash", nextTool);

    const skill: SkillConfig = {
      name: "continue-skill",
      description: "Test continue",
      steps: [
        { tool: "build", on_fail: "continue" },
        { tool: "flash", on_fail: "continue" },
      ],
    };

    const session = await runSkill(skill, deps);
    assert.equal(session.toolResults.length, 2);
  });

  it("skips missing tools gracefully", async () => {
    const deps = makeBaseDeps(tmpDir);
    // No tools registered

    const skill: SkillConfig = {
      name: "missing-tool-skill",
      description: "Test missing tool",
      steps: [
        { tool: "nonexistent", on_fail: "continue" },
      ],
    };

    const session = await runSkill(skill, deps);
    // Should not crash, just log error and continue
    assert.equal(session.toolResults.length, 0);
  });

  it("handles evidence step", async () => {
    const buildTool = makeFakeToolDef("build", "echo built");
    const deps = makeBaseDeps(tmpDir);
    deps.tools.set("build", buildTool);

    const skill: SkillConfig = {
      name: "evidence-skill",
      description: "Test evidence",
      steps: [
        { tool: "build", on_fail: "continue" },
        { action: "evidence", summary: true },
      ],
    };

    const session = await runSkill(skill, deps);
    assert.equal(session.toolResults.length, 1);
    // Evidence should have been written
    const evidencePath = path.join(session.runDir, "evidence.json");
    assert.equal(fs.existsSync(evidencePath), true);
  });
});
