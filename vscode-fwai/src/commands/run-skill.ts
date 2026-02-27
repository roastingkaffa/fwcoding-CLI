import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";
import { runFwaiSkill } from "../lib/cli-runner.js";
import type { EvidenceTreeProvider } from "../views/evidence-tree.js";

export function registerRunSkillCommand(
  ctx: FwaiContext,
  cwd: string,
  output: vscode.OutputChannel,
  evidenceTree: EvidenceTreeProvider
): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.runSkill", async () => {
    const skills = await ctx.getSkills();
    const items = Array.from(skills.entries()).map(([name, skill]) => ({
      label: name,
      description: skill.description ?? "",
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: "Select a skill to run" });
    if (!picked) return;
    output.show(true);
    output.appendLine(`[FWAI] Running skill: ${picked.label}`);
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `FWAI: Running ${picked.label}...` },
      () => runFwaiSkill(picked.label, cwd)
    );
    output.appendLine(result.stdout);
    if (result.stderr) output.appendLine(result.stderr);
    evidenceTree.refresh();
  });
}
