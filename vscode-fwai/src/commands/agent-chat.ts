import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";
import type { ChatPanelProvider } from "../panels/chat-panel.js";

export function registerAgentChatCommand(
  ctx: FwaiContext,
  chatProvider: ChatPanelProvider
): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.agentChat", async () => {
    const agents = await ctx.getAgents();
    const items = Array.from(agents.entries()).map(([name, agent]) => ({
      label: name,
      description: agent.description ?? "",
    }));
    items.unshift({ label: "(free-form)", description: "Chat without agent scope" });
    const picked = await vscode.window.showQuickPick(items, { placeHolder: "Select an agent" });
    if (!picked) return;
    const agentName = picked.label === "(free-form)" ? undefined : picked.label;
    chatProvider.selectAgent(agentName);
    await vscode.commands.executeCommand("fwai.chatPanel.focus");
  });
}
