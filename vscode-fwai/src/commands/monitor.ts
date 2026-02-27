import * as vscode from "vscode";

export function registerMonitorCommand(cwd: string): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.monitor", () => {
    const cliPath = vscode.workspace.getConfiguration("fwai").get("cliPath", "fwai");
    const terminal = vscode.window.createTerminal({
      name: "FWAI Monitor",
      shellPath: cliPath,
      shellArgs: ["monitor"],
      cwd,
    });
    terminal.show();
  });
}
