/**
 * Memory analysis panel — renders Flash/RAM usage bar charts.
 */

import * as vscode from "vscode";
import { execSync } from "node:child_process";
import { getFwaiLib } from "../lib/fwai-bridge.js";
import type { Project } from "../types.js";

export async function showMemoryPanel(
  elfPath: string,
  project: Project,
  cwd: string,
  extensionUri: vscode.Uri
): Promise<void> {
  const lib = await getFwaiLib();
  const p = project.project;

  // Run arm-none-eabi-size (or equivalent) on the ELF
  let sizeOutput: string;
  try {
    const sizeCmd = `${p.toolchain.compiler.replace("gcc", "size")} -A ${elfPath}`;
    sizeOutput = execSync(sizeCmd, { cwd, encoding: "utf-8" });
  } catch {
    vscode.window.showErrorMessage("Failed to run size tool. Ensure toolchain is in PATH.");
    return;
  }

  const parsed = lib.parseSizeOutput(sizeOutput);
  if (!parsed) {
    vscode.window.showErrorMessage("Could not parse size output.");
    return;
  }

  const flashTotal = lib.parseSizeString?.(p.target.flash_size ?? "512K") ?? 512 * 1024;
  const ramTotal = lib.parseSizeString?.(p.target.ram_size ?? "128K") ?? 128 * 1024;
  const report = lib.computeMemoryReport(parsed, flashTotal, ramTotal);

  const panel = vscode.window.createWebviewPanel(
    "fwai.memoryPanel",
    "Memory Analysis",
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  const flashColor = report.flash_percent < 75 ? "#4caf50" : report.flash_percent < 90 ? "#ff9800" : "#f44336";
  const ramColor = report.ram_percent < 75 ? "#4caf50" : report.ram_percent < 90 ? "#ff9800" : "#f44336";

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
    h2 { margin-bottom: 16px; }
    .bar-container { background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; height: 28px; margin: 8px 0 16px; }
    .bar-fill { height: 100%; border-radius: 4px; display: flex; align-items: center; padding: 0 8px; font-weight: bold; font-size: 0.85em; }
    .label { display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    th { color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h2>Memory Analysis</h2>

  <div class="label"><span>Flash</span><span>${(report.flash_used / 1024).toFixed(1)} KB / ${(report.flash_total / 1024).toFixed(1)} KB (${report.flash_percent.toFixed(1)}%)</span></div>
  <div class="bar-container"><div class="bar-fill" style="width:${Math.min(report.flash_percent, 100)}%;background:${flashColor}">${report.flash_percent.toFixed(1)}%</div></div>

  <div class="label"><span>RAM</span><span>${(report.ram_used / 1024).toFixed(1)} KB / ${(report.ram_total / 1024).toFixed(1)} KB (${report.ram_percent.toFixed(1)}%)</span></div>
  <div class="bar-container"><div class="bar-fill" style="width:${Math.min(report.ram_percent, 100)}%;background:${ramColor}">${report.ram_percent.toFixed(1)}%</div></div>

  <h3>Size Breakdown</h3>
  <table>
    <tr><th>Section</th><th>Size</th></tr>
    <tr><td>.text</td><td>${parsed.text} bytes</td></tr>
    <tr><td>.data</td><td>${parsed.data} bytes</td></tr>
    <tr><td>.bss</td><td>${parsed.bss} bytes</td></tr>
    <tr><td>Total</td><td>${parsed.total} bytes</td></tr>
  </table>
</body>
</html>`;
}
