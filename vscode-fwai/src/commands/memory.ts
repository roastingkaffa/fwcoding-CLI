import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";
import { showMemoryPanel } from "../panels/memory-panel.js";

export function registerMemoryCommand(ctx: FwaiContext, extensionUri: vscode.Uri): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.analyzeMemory", async () => {
    const elfPath = await vscode.window.showInputBox({
      prompt: "Path to ELF file (relative to workspace)",
      placeHolder: "build/firmware.elf",
    });
    if (!elfPath) return;

    const project = ctx.getProject();
    if (!project) {
      vscode.window.showErrorMessage("No project loaded. Run FWAI: Init first.");
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "FWAI: Analyzing memory..." },
      async () => showMemoryPanel(elfPath, project, ctx.cwd, extensionUri)
    );
  });
}
