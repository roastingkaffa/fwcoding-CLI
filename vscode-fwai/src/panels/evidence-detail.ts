/**
 * Evidence detail webview panel — renders full Evidence object.
 */

import * as vscode from "vscode";
import type { Evidence } from "../types.js";

export function showEvidenceDetail(
  evidence: Evidence,
  runId: string,
  extensionUri: vscode.Uri
): void {
  const panel = vscode.window.createWebviewPanel(
    "fwai.evidenceDetail",
    `Evidence: ${runId}`,
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  const statusBadge = evidence.status === "success"
    ? '<span class="badge pass">SUCCESS</span>'
    : `<span class="badge fail">${esc(evidence.status.toUpperCase())}</span>`;

  const toolRows = evidence.tools
    .map(
      (tr) =>
        `<tr><td>${esc(tr.tool)}</td><td class="${tr.status}">${tr.status}</td><td>${tr.duration_ms}ms</td></tr>`
    )
    .join("");

  const bootSection = evidence.boot_status
    ? `<h3>Boot Status</h3>
       <p>${evidence.boot_status.status} — ${evidence.boot_status.boot_time_ms ?? "?"}ms</p>`
    : "";

  const changesSection = evidence.changes
    ? `<h3>Changes</h3>
       <p>${evidence.changes.files_changed} files, +${evidence.changes.lines_added}/-${evidence.changes.lines_removed}</p>`
    : "";

  const agenticSection = evidence.agentic
    ? `<h3>Agentic Session</h3>
       <p>Iterations: ${evidence.agentic.total_iterations}, Tool calls: ${evidence.agentic.tool_calls?.length ?? 0}</p>`
    : "";

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
    h2 { margin-bottom: 12px; }
    h3 { margin-top: 16px; margin-bottom: 8px; color: var(--vscode-descriptionForeground); }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
    th { color: var(--vscode-descriptionForeground); }
    .badge { padding: 3px 10px; border-radius: 10px; font-weight: bold; }
    .badge.pass { background: #1b5e20; color: #a5d6a7; }
    .badge.fail { background: #b71c1c; color: #ef9a9a; }
    .success { color: #4caf50; }
    .fail { color: #f44336; }
  </style>
</head>
<body>
  <h2>${esc(runId)} ${statusBadge}</h2>
  <p>Skill: ${esc(evidence.skill ?? "manual")} | Started: ${esc(evidence.start_time)} | Duration: ${evidence.duration_ms}ms</p>

  <h3>Tool Results</h3>
  <table>
    <tr><th>Tool</th><th>Status</th><th>Duration</th></tr>
    ${toolRows}
  </table>

  ${bootSection}
  ${changesSection}
  ${agenticSection}
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
