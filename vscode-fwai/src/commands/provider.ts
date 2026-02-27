import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";
import { spawnFwai } from "../lib/cli-runner.js";

const PROVIDERS = [
  { label: "anthropic", description: "Claude (Anthropic)" },
  { label: "openai", description: "GPT (OpenAI)" },
  { label: "gemini", description: "Gemini (Google)" },
  { label: "local", description: "Local / Ollama" },
];

export function registerProviderCommand(ctx: FwaiContext): vscode.Disposable {
  return vscode.commands.registerCommand("fwai.switchProvider", async () => {
    const provider = await vscode.window.showQuickPick(PROVIDERS, {
      placeHolder: "Select LLM provider",
    });
    if (!provider) return;

    const model = await vscode.window.showInputBox({
      prompt: `Model name for ${provider.label}`,
      placeHolder: provider.label === "anthropic" ? "claude-sonnet-4-20250514" : "model-name",
    });
    if (!model) return;

    await spawnFwai(["config", "set", "provider.name", provider.label], ctx.cwd);
    await spawnFwai(["config", "set", "provider.model", model], ctx.cwd);
    vscode.window.showInformationMessage(`FWAI: Switched to ${provider.label} / ${model}`);
  });
}
