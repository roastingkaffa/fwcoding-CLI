import * as vscode from "vscode";
import { spawnFwai } from "../lib/cli-runner.js";

export function registerInitCommand(cwd: string, output: vscode.OutputChannel): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.init", async () => {
    output.show(true);
    output.appendLine("[FWAI] Initializing workspace...");
    const result = await spawnFwai(["init"], cwd);
    output.appendLine(result.stdout);
    if (result.stderr) output.appendLine(result.stderr);
    if (result.exitCode === 0) {
      const action = await vscode.window.showInformationMessage(
        "FWAI workspace initialized. Reload window?",
        "Reload"
      );
      if (action === "Reload") await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  });
}
