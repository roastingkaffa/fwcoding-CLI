import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";
import { showEvidenceDetail } from "../panels/evidence-detail.js";

export function registerEvidenceCommand(ctx: FwaiContext, extensionUri: vscode.Uri): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.showEvidence", async () => {
    const runs = await ctx.getRecentRuns(20);
    if (runs.length === 0) {
      vscode.window.showInformationMessage("No evidence runs found.");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      runs.map((r) => ({ label: r })),
      { placeHolder: "Select a run to view" }
    );
    if (!picked) return;
    const evidence = await ctx.getEvidence(picked.label);
    if (!evidence) {
      vscode.window.showErrorMessage(`Could not load evidence for ${picked.label}`);
      return;
    }
    showEvidenceDetail(evidence, picked.label, extensionUri);
  });
}
