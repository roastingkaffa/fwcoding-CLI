/**
 * FwaiContext — singleton per workspace.
 * Holds loaded config/project/provider refs and fires change events.
 */

import * as vscode from "vscode";
import { withCwd } from "./lib/fwai-bridge.js";
import type { Config, Project, Evidence, SkillConfig, AgentConfig, ToolDef } from "./types.js";

export class FwaiContext {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private config: Config | null = null;
  private project: Project | null = null;
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor(readonly cwd: string) {
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(cwd, ".fwai/**")
    );
    this.watcher.onDidChange(() => this.refresh());
    this.watcher.onDidCreate(() => this.refresh());
    this.watcher.onDidDelete(() => this.refresh());
  }

  async init(): Promise<void> {
    await this.loadCore();
  }

  private async loadCore(): Promise<void> {
    try {
      this.config = await withCwd((lib, cwd) => lib.loadConfig(cwd), this.cwd);
      this.project = await withCwd((lib, cwd) => lib.loadProject(cwd), this.cwd);
    } catch {
      this.config = null;
      this.project = null;
    }
  }

  private refresh(): void {
    this.loadCore().then(() => this._onDidChange.fire());
  }

  getConfig(): Config | null { return this.config; }
  getProject(): Project | null { return this.project; }

  async getSkills(): Promise<Map<string, SkillConfig>> {
    return withCwd((lib, cwd) => lib.loadSkillMap(cwd), this.cwd);
  }

  async getAgents(): Promise<Map<string, AgentConfig>> {
    return withCwd((lib, cwd) => lib.loadAgentMap(cwd), this.cwd);
  }

  async getTools(): Promise<ToolDef[]> {
    return withCwd((lib, cwd) => lib.loadTools(cwd), this.cwd);
  }

  async getEvidence(runId: string): Promise<Evidence | null> {
    return withCwd((lib, cwd) => lib.loadEvidence(runId, cwd), this.cwd);
  }

  async getRecentRuns(limit = 20): Promise<string[]> {
    return withCwd((lib, cwd) => lib.listRecentRuns(limit, cwd), this.cwd);
  }

  dispose(): void {
    this.watcher?.dispose();
    this._onDidChange.dispose();
  }
}
