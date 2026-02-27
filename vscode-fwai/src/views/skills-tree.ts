/**
 * Skills tree view — lists available skills with expandable steps.
 */

import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";
import type { SkillConfig, SkillStep } from "../types.js";

type TreeItem = SkillItem | StepItem;

function getStepType(step: SkillStep): string {
  if ("tool" in step) return "tool";
  if ("action" in step) return step.action;
  return "unknown";
}

function getStepDetail(step: SkillStep): string {
  if ("tool" in step) return step.tool;
  if ("action" in step && step.action === "llm_analyze") return step.prompt.slice(0, 50);
  if ("action" in step && step.action === "agentic") return step.goal.slice(0, 50);
  return "";
}

class SkillItem extends vscode.TreeItem {
  constructor(readonly name: string, readonly skill: SkillConfig) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = skill.description ?? "";
    this.iconPath = new vscode.ThemeIcon("zap");
    this.contextValue = "skill";
  }
}

class StepItem extends vscode.TreeItem {
  constructor(step: SkillStep, index: number) {
    const stepType = getStepType(step);
    super(`${index + 1}. ${stepType}`, vscode.TreeItemCollapsibleState.None);
    this.description = getStepDetail(step);
    const icons: Record<string, string> = {
      tool: "wrench",
      evidence: "beaker",
      llm_analyze: "comment-discussion",
      agentic: "robot",
    };
    this.iconPath = new vscode.ThemeIcon(icons[stepType] ?? "circle-outline");
  }
}

export class SkillsTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private ctx: FwaiContext) {
    ctx.onDidChange(() => this.refresh());
  }

  refresh(): void { this._onDidChange.fire(undefined); }

  async getTreeItem(element: TreeItem): Promise<TreeItem> { return element; }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!element) {
      const skills = await this.ctx.getSkills();
      return Array.from(skills.entries()).map(([name, skill]) => new SkillItem(name, skill));
    }
    if (element instanceof SkillItem) {
      return (element.skill.steps ?? []).map((step, i) => new StepItem(step, i));
    }
    return [];
  }
}
