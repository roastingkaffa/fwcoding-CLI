/**
 * Agents tree view — lists available agents with metadata.
 */

import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";
import type { AgentConfig } from "../types.js";

class AgentItem extends vscode.TreeItem {
  constructor(readonly name: string, agent: AgentConfig) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.description = agent.description ?? "";
    this.tooltip = [
      `Model: ${agent.model ?? "default"}`,
      `Tools: ${agent.tools?.length ?? "all"}`,
      agent.description,
    ].filter(Boolean).join("\n");
    this.iconPath = new vscode.ThemeIcon("robot");
    this.contextValue = "agent";
  }
}

export class AgentsTreeProvider implements vscode.TreeDataProvider<AgentItem> {
  private readonly _onDidChange = new vscode.EventEmitter<AgentItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private ctx: FwaiContext) {
    ctx.onDidChange(() => this.refresh());
  }

  refresh(): void { this._onDidChange.fire(undefined); }

  async getTreeItem(element: AgentItem): Promise<AgentItem> { return element; }

  async getChildren(element?: AgentItem): Promise<AgentItem[]> {
    if (element) return [];
    const agents = await this.ctx.getAgents();
    return Array.from(agents.entries()).map(([name, agent]) => new AgentItem(name, agent));
  }
}
