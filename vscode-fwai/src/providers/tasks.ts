/**
 * Task provider — auto-detects skills as VS Code tasks.
 */

import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";

export class FwaiTaskProvider implements vscode.TaskProvider {
  constructor(private ctx: FwaiContext, private cwd: string) {}

  async provideTasks(): Promise<vscode.Task[]> {
    const skills = await this.ctx.getSkills();
    const cliPath = vscode.workspace.getConfiguration("fwai").get("cliPath", "fwai");
    const tasks: vscode.Task[] = [];

    for (const [name, skill] of skills) {
      const def: vscode.TaskDefinition = { type: "fwai", operation: "run", skill: name };
      const exec = new vscode.ShellExecution(`${cliPath} run ${name} --json`, { cwd: this.cwd });
      const task = new vscode.Task(
        def,
        vscode.TaskScope.Workspace,
        `fwai: ${name}`,
        "fwai",
        exec,
        "$fwai-gcc"
      );
      task.detail = skill.description;
      tasks.push(task);
    }

    return tasks;
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const def = task.definition;
    if (def.type === "fwai" && def.operation && def.skill) {
      const cliPath = vscode.workspace.getConfiguration("fwai").get("cliPath", "fwai");
      const exec = new vscode.ShellExecution(
        `${cliPath} ${def.operation} ${def.skill} --json`,
        { cwd: this.cwd }
      );
      return new vscode.Task(
        def,
        vscode.TaskScope.Workspace,
        `fwai: ${def.skill}`,
        "fwai",
        exec,
        "$fwai-gcc"
      );
    }
    return undefined;
  }
}
