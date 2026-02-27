/**
 * Status bar items — project info + provider status.
 */

import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";

export function createStatusBar(ctx: FwaiContext): vscode.Disposable[] {
  const showStatusBar = vscode.workspace.getConfiguration("fwai").get("showStatusBar", true);
  if (!showStatusBar) return [];

  // Project info
  const projectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  projectItem.command = "fwai.showConfig";

  // Provider status
  const providerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 49);
  providerItem.command = "fwai.switchProvider";

  function update(): void {
    const project = ctx.getProject();
    const config = ctx.getConfig();

    if (project) {
      const p = project.project;
      projectItem.text = `$(circuit-board) FWAI: ${p.name} | ${p.target.mcu}`;
      projectItem.show();
    } else {
      projectItem.hide();
    }

    if (config?.provider) {
      providerItem.text = `$(cloud) ${config.provider.model ?? config.provider.name}`;
      providerItem.show();
    } else {
      providerItem.text = "$(cloud-offline) No LLM";
      providerItem.show();
    }
  }

  update();
  const sub = ctx.onDidChange(() => update());

  return [projectItem, providerItem, sub];
}
