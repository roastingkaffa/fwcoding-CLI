/**
 * Evidence tree view — shows recent runs with expandable tool results.
 */

import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";
import type { Evidence, ToolResult } from "../types.js";

type TreeItem = RunItem | ToolResultItem | InfoItem;

class RunItem extends vscode.TreeItem {
  constructor(readonly runId: string, readonly evidence: Evidence | null) {
    super(runId, vscode.TreeItemCollapsibleState.Collapsed);
    if (evidence) {
      const icon = evidence.status === "success" ? "pass" : "error";
      this.description = `${evidence.skill ?? "manual"}`;
      this.iconPath = new vscode.ThemeIcon(icon);
    }
    this.contextValue = "evidenceRun";
  }
}

class ToolResultItem extends vscode.TreeItem {
  constructor(result: ToolResult) {
    super(result.tool, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(result.status === "success" ? "pass" : "error");
    this.description = `${result.status} (${result.duration_ms}ms)`;
  }
}

class InfoItem extends vscode.TreeItem {
  constructor(label: string, detail: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = detail;
  }
}

export class EvidenceTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private runs: Array<{ runId: string; evidence: Evidence | null }> = [];

  constructor(private ctx: FwaiContext) {
    ctx.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.runs = [];
    this._onDidChange.fire(undefined);
  }

  async getTreeItem(element: TreeItem): Promise<TreeItem> {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!element) {
      const runIds = await this.ctx.getRecentRuns(20);
      this.runs = await Promise.all(
        runIds.map(async (runId) => ({
          runId,
          evidence: await this.ctx.getEvidence(runId),
        }))
      );
      return this.runs.map((r) => new RunItem(r.runId, r.evidence));
    }

    if (element instanceof RunItem && element.evidence) {
      const ev = element.evidence;
      const items: TreeItem[] = [];

      for (const tr of ev.tools) {
        items.push(new ToolResultItem(tr));
      }

      if (ev.boot_status) {
        items.push(new InfoItem("Boot", `${ev.boot_status.status} (${ev.boot_status.boot_time_ms ?? "?"}ms)`));
      }

      if (ev.changes) {
        items.push(new InfoItem("Changes", `${ev.changes.files_changed} files, +${ev.changes.lines_added}/-${ev.changes.lines_removed}`));
      }

      return items;
    }

    return [];
  }
}
