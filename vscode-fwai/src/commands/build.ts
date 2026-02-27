import * as vscode from "vscode";
import { spawnFwai } from "../lib/cli-runner.js";
import { parseBuildDiagnostics } from "../providers/diagnostics.js";
import type { EvidenceTreeProvider } from "../views/evidence-tree.js";

export function registerBuildCommand(
  cwd: string,
  output: vscode.OutputChannel,
  diagnostics: vscode.DiagnosticCollection,
  evidenceTree: EvidenceTreeProvider
): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.build", async () => {
    output.show(true);
    output.appendLine("[FWAI] Running build...");
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "FWAI: Building..." },
      () => spawnFwai(["run", "bringup", "--json"], cwd)
    );
    output.appendLine(result.stdout);
    if (result.stderr) output.appendLine(result.stderr);
    parseBuildDiagnostics(cwd, diagnostics);
    evidenceTree.refresh();
    if (result.exitCode === 0) {
      vscode.window.showInformationMessage("FWAI: Build succeeded");
    } else {
      vscode.window.showErrorMessage(`FWAI: Build failed (exit ${result.exitCode})`);
    }
  });
}
