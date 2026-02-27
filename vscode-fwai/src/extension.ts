/**
 * FWAI VS Code Extension — main entry point.
 */

import * as vscode from "vscode";
import { FwaiContext } from "./fwai-context.js";
import { EvidenceTreeProvider } from "./views/evidence-tree.js";
import { SkillsTreeProvider } from "./views/skills-tree.js";
import { AgentsTreeProvider } from "./views/agents-tree.js";
import { ToolsTreeProvider } from "./views/tools-tree.js";
import { ChatPanelProvider } from "./panels/chat-panel.js";
import { createStatusBar } from "./statusbar/status-bar.js";
import { FwaiTaskProvider } from "./providers/tasks.js";
import { registerBuildCommand } from "./commands/build.js";
import { registerFlashCommand } from "./commands/flash.js";
import { registerMonitorCommand } from "./commands/monitor.js";
import { registerRunSkillCommand } from "./commands/run-skill.js";
import { registerAgentChatCommand } from "./commands/agent-chat.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerInitCommand } from "./commands/init.js";
import { registerProviderCommand } from "./commands/provider.js";
import { registerOpenReplCommand } from "./commands/open-repl.js";
import { registerEvidenceCommand } from "./commands/evidence.js";
import { registerMemoryCommand } from "./commands/memory.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const cwd = workspaceFolder.uri.fsPath;
  const ctx = new FwaiContext(cwd);
  await ctx.init();
  context.subscriptions.push({ dispose: () => ctx.dispose() });

  // Output channel for CLI output
  const output = vscode.window.createOutputChannel("FWAI");
  context.subscriptions.push(output);

  // Diagnostics
  const diagnostics = vscode.languages.createDiagnosticCollection("fwai");
  context.subscriptions.push(diagnostics);

  // Tree views
  const evidenceTree = new EvidenceTreeProvider(ctx);
  const skillsTree = new SkillsTreeProvider(ctx);
  const agentsTree = new AgentsTreeProvider(ctx);
  const toolsTree = new ToolsTreeProvider(ctx);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("fwai.evidenceView", evidenceTree),
    vscode.window.registerTreeDataProvider("fwai.skillsView", skillsTree),
    vscode.window.registerTreeDataProvider("fwai.agentsView", agentsTree),
    vscode.window.registerTreeDataProvider("fwai.toolsView", toolsTree),
  );

  // Chat panel (webview view)
  const chatProvider = new ChatPanelProvider(context.extensionUri, ctx);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("fwai.chatPanel", chatProvider)
  );

  // Status bar
  const statusDisposables = createStatusBar(ctx);
  context.subscriptions.push(...statusDisposables);

  // Task provider
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider("fwai", new FwaiTaskProvider(ctx, cwd))
  );

  // Commands
  context.subscriptions.push(
    registerInitCommand(cwd, output),
    registerBuildCommand(cwd, output, diagnostics, evidenceTree),
    registerFlashCommand(cwd, output),
    registerMonitorCommand(cwd),
    registerRunSkillCommand(ctx, cwd, output, evidenceTree),
    registerAgentChatCommand(ctx, chatProvider),
    registerDoctorCommand(cwd, output),
    registerEvidenceCommand(ctx, context.extensionUri),
    registerMemoryCommand(ctx, context.extensionUri),
    registerProviderCommand(ctx),
    registerOpenReplCommand(),
    vscode.commands.registerCommand("fwai.refreshViews", () => {
      evidenceTree.refresh();
      skillsTree.refresh();
      agentsTree.refresh();
      toolsTree.refresh();
    }),
    vscode.commands.registerCommand("fwai.showConfig", () => {
      const configPath = vscode.Uri.file(`${cwd}/.fwai/config.yaml`);
      vscode.window.showTextDocument(configPath);
    }),
  );
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
