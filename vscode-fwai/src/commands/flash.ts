import * as vscode from "vscode";
import { spawnFwai } from "../lib/cli-runner.js";

export function registerFlashCommand(cwd: string, output: vscode.OutputChannel): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.flash", async () => {
    const confirm = await vscode.window.showWarningMessage(
      "Flash firmware to device? This will overwrite the current firmware.",
      { modal: true },
      "Flash"
    );
    if (confirm !== "Flash") return;
    output.show(true);
    output.appendLine("[FWAI] Flashing...");
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "FWAI: Flashing..." },
      () => spawnFwai(["run", "flash", "--json"], cwd)
    );
    output.appendLine(result.stdout);
    if (result.stderr) output.appendLine(result.stderr);
  });
}
