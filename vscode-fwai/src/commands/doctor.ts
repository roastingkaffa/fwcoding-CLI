import * as vscode from "vscode";
import { spawnFwai } from "../lib/cli-runner.js";

export function registerDoctorCommand(cwd: string, output: vscode.OutputChannel): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.doctor", async () => {
    output.show(true);
    output.appendLine("[FWAI] Running doctor...");
    const result = await spawnFwai(["doctor"], cwd);
    output.appendLine(result.stdout);
    if (result.stderr) output.appendLine(result.stderr);
  });
}
