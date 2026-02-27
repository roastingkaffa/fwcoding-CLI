/**
 * Tests for extension activation and structure.
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Extension", () => {
  const pkgPath = path.join(__dirname, "../../../package.json");
  const extensionSrcPath = path.join(__dirname, "../../extension.ts");

  it("package.json defines all 13 commands", () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const commands = pkg.contributes.commands.map((c: any) => c.command);
    const expected = [
      "fwai.init", "fwai.build", "fwai.flash", "fwai.monitor",
      "fwai.runSkill", "fwai.agentChat", "fwai.doctor",
      "fwai.showEvidence", "fwai.analyzeMemory", "fwai.switchProvider",
      "fwai.openRepl", "fwai.refreshViews", "fwai.showConfig",
    ];
    for (const cmd of expected) {
      assert.ok(commands.includes(cmd), `Missing command: ${cmd}`);
    }
  });

  it("package.json defines 4 tree views + 1 webview", () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const treeViews = pkg.contributes.views["fwai-explorer"].map((v: any) => v.id);
    assert.deepStrictEqual(treeViews, [
      "fwai.evidenceView", "fwai.skillsView", "fwai.agentsView", "fwai.toolsView",
    ]);
    const panelViews = pkg.contributes.views.panel.map((v: any) => v.id);
    assert.ok(panelViews.includes("fwai.chatPanel"));
  });

  it("package.json defines fwai task type", () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const taskDef = pkg.contributes.taskDefinitions[0];
    assert.strictEqual(taskDef.type, "fwai");
    assert.ok(taskDef.required.includes("operation"));
  });

  it("package.json defines configuration properties", () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const props = Object.keys(pkg.contributes.configuration.properties);
    assert.ok(props.includes("fwai.cliPath"));
    assert.ok(props.includes("fwai.autoRefreshEvidence"));
    assert.ok(props.includes("fwai.showStatusBar"));
    assert.ok(props.includes("fwai.chat.streamingEnabled"));
  });

  it("extension.ts exports activate and deactivate", () => {
    const src = fs.readFileSync(extensionSrcPath, "utf-8");
    assert.ok(src.includes("export async function activate"));
    assert.ok(src.includes("export function deactivate"));
  });
});
