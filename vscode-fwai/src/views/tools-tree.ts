/**
 * Tools tree view — lists tool definitions from .fwai/tools/.
 */

import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";
import type { ToolDef } from "../types.js";

class ToolItem extends vscode.TreeItem {
  constructor(tool: ToolDef, cwd: string) {
    super(tool.name, vscode.TreeItemCollapsibleState.None);
    this.description = tool.command?.slice(0, 50) ?? "";
    this.tooltip = [
      `Command: ${tool.command}`,
      `Timeout: ${tool.timeout_sec}s`,
      tool.guard ? `Guard: confirmation required` : null,
    ].filter(Boolean).join("\n");
    this.iconPath = new vscode.ThemeIcon("wrench");
    this.command = {
      command: "vscode.open",
      title: "Open Tool Definition",
      arguments: [vscode.Uri.file(`${cwd}/.fwai/tools/${tool.name}.tool.yaml`)],
    };
  }
}

export class ToolsTreeProvider implements vscode.TreeDataProvider<ToolItem> {
  private readonly _onDidChange = new vscode.EventEmitter<ToolItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private ctx: FwaiContext) {
    ctx.onDidChange(() => this.refresh());
  }

  refresh(): void { this._onDidChange.fire(undefined); }

  async getTreeItem(element: ToolItem): Promise<ToolItem> { return element; }

  async getChildren(element?: ToolItem): Promise<ToolItem[]> {
    if (element) return [];
    const tools = await this.ctx.getTools();
    return tools.map((t) => new ToolItem(t, this.ctx.cwd));
  }
}
