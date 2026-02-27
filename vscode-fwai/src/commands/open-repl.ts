import * as vscode from "vscode";

export function registerOpenReplCommand(): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.openRepl", () => {
    const cliPath = vscode.workspace.getConfiguration("fwai").get("cliPath", "fwai");
    const terminal = vscode.window.createTerminal({
      name: "FWAI",
      shellPath: cliPath,
    });
    terminal.show();
  });
}
