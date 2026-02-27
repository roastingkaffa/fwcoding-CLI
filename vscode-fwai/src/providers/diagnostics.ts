/**
 * Diagnostics — parse GCC-style errors from build logs.
 */

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";

const GCC_REGEX = /^(.+):(\d+):(\d+):\s+(warning|error):\s+(.+)$/;

export function parseBuildDiagnostics(
  cwd: string,
  collection: vscode.DiagnosticCollection
): void {
  collection.clear();

  // Find the latest run directory with a build log
  const runsDir = path.join(cwd, ".fwai", "runs");
  if (!fs.existsSync(runsDir)) return;

  const runs = fs.readdirSync(runsDir).sort().reverse();
  let logContent = "";
  for (const run of runs) {
    const logPath = path.join(runsDir, run, "build.log");
    if (fs.existsSync(logPath)) {
      logContent = fs.readFileSync(logPath, "utf-8");
      break;
    }
  }
  if (!logContent) return;

  const diagnosticMap = new Map<string, vscode.Diagnostic[]>();

  for (const line of logContent.split("\n")) {
    const match = GCC_REGEX.exec(line);
    if (!match) continue;

    const [, file, lineStr, colStr, severity, message] = match;
    const lineNum = parseInt(lineStr, 10) - 1;
    const col = parseInt(colStr, 10) - 1;
    const range = new vscode.Range(lineNum, col, lineNum, col);
    const diag = new vscode.Diagnostic(
      range,
      message,
      severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
    );
    diag.source = "fwai";

    const absPath = path.isAbsolute(file) ? file : path.join(cwd, file);
    const existing = diagnosticMap.get(absPath) ?? [];
    existing.push(diag);
    diagnosticMap.set(absPath, existing);
  }

  for (const [filePath, diags] of diagnosticMap) {
    collection.set(vscode.Uri.file(filePath), diags);
  }
}
