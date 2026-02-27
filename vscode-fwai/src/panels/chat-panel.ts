/**
 * Agent chat panel — WebviewViewProvider with streaming agentic loop.
 */

import * as vscode from "vscode";
import type { FwaiContext } from "../fwai-context.js";
import { withCwd, getFwaiLib } from "../lib/fwai-bridge.js";
import type { AgenticLoopConfig } from "../types.js";

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private conversationHistory: unknown[] = [];
  private selectedAgent: string | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly ctx: FwaiContext
  ) {}

  selectAgent(name: string | undefined): void {
    this.selectedAgent = name;
    this.conversationHistory = [];
    this.postMessage({ type: "clearHistory" });
    if (name) {
      this.postMessage({ type: "agentSelected", name });
    }
  }

  resolveWebviewView(
    view: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml(view.webview);

    // Send agent list on load
    this.ctx.getAgents().then((agents) => {
      this.postMessage({ type: "agentList", agents: Array.from(agents.keys()) });
    });

    view.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "sendMessage":
          await this.handleUserMessage(msg.text);
          break;
        case "selectAgent":
          this.selectAgent(msg.name || undefined);
          break;
        case "clearHistory":
          this.conversationHistory = [];
          break;
      }
    });
  }

  private async handleUserMessage(text: string): Promise<void> {
    try {
      const lib = await getFwaiLib();
      const config = this.ctx.getConfig();
      if (!config?.provider) {
        this.postMessage({ type: "error", message: "No LLM provider configured. Run FWAI: Switch Provider." });
        return;
      }

      const provider = await lib.createProvider(config.provider);
      const project = this.ctx.getProject();
      const projectCtx = project ? lib.buildProjectContext(project) : undefined;
      const systemPrompt = projectCtx
        ? lib.formatContextBlock(projectCtx)
        : "You are FWAI, an AI firmware development assistant.";

      let loopConfig: AgenticLoopConfig;

      if (this.selectedAgent) {
        const agent = await withCwd((l, cwd) => l.getAgent(this.selectedAgent!, cwd), this.ctx.cwd);
        if (agent) {
          loopConfig = lib.createAgentLoopConfig(agent, {
            provider,
            projectCtx: projectCtx ?? { name: "unknown", mcu: "unknown" },
            cwd: this.ctx.cwd,
            onToolCall: (name: string, input: Record<string, unknown>) => this.postMessage({ type: "toolCall", name, input }),
            onToolResult: (name: string, _result: string, isError: boolean) => this.postMessage({ type: "toolResult", name, isError }),
            onTextOutput: (text: string) => this.postMessage({ type: "textComplete", text }),
          });
        } else {
          loopConfig = this.buildFreeformConfig(provider, systemPrompt, lib);
        }
      } else {
        loopConfig = this.buildFreeformConfig(provider, systemPrompt, lib);
      }

      // Enable streaming deltas
      const streamingEnabled = vscode.workspace.getConfiguration("fwai").get("chat.streamingEnabled", true);
      loopConfig.streaming = streamingEnabled;
      loopConfig.onTextDelta = (delta: string) => this.postMessage({ type: "textDelta", text: delta });

      const result = await lib.runAgenticLoop(text, this.conversationHistory, loopConfig);
      this.conversationHistory = result.messages;
      this.postMessage({ type: "textComplete", text: result.finalText });
    } catch (err) {
      this.postMessage({ type: "error", message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private buildFreeformConfig(provider: unknown, systemPrompt: string, lib: any): AgenticLoopConfig {
    const registry = lib.ToolRegistry.createDefault();
    return {
      provider,
      registry,
      systemPrompt,
      context: { cwd: this.ctx.cwd },
      maxIterations: 20,
      onToolCall: (name: string, input: Record<string, unknown>) =>
        this.postMessage({ type: "toolCall", name, input }),
      onToolResult: (name: string, _result: string, isError: boolean) =>
        this.postMessage({ type: "toolResult", name, isError }),
      onTextOutput: (text: string) =>
        this.postMessage({ type: "textComplete", text }),
    };
  }

  private postMessage(msg: unknown): void {
    this.view?.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "src", "webview", "chat.css")
    );
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div id="header">
    <select id="agent-select"><option value="">Free-form</option></select>
    <button id="clear-btn" title="Clear chat">Clear</button>
  </div>
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="input" rows="2" placeholder="Ask FWAI..."></textarea>
    <button id="send-btn">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send-btn');
    const clearBtn = document.getElementById('clear-btn');
    const agentSelect = document.getElementById('agent-select');
    let currentAssistantBubble = null;

    function addBubble(role, text) {
      const div = document.createElement('div');
      div.className = 'bubble ' + role;
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return div;
    }

    function addBadge(text, cls) {
      const span = document.createElement('span');
      span.className = 'badge ' + (cls || '');
      span.textContent = text;
      messages.appendChild(span);
      messages.scrollTop = messages.scrollHeight;
    }

    sendBtn.addEventListener('click', () => {
      const text = input.value.trim();
      if (!text) return;
      addBubble('user', text);
      currentAssistantBubble = null;
      vscode.postMessage({ type: 'sendMessage', text });
      input.value = '';
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    clearBtn.addEventListener('click', () => {
      messages.innerHTML = '';
      currentAssistantBubble = null;
      vscode.postMessage({ type: 'clearHistory' });
    });

    agentSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'selectAgent', name: agentSelect.value });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'textDelta':
          if (!currentAssistantBubble) {
            currentAssistantBubble = addBubble('assistant', '');
          }
          currentAssistantBubble.textContent += msg.text;
          messages.scrollTop = messages.scrollHeight;
          break;
        case 'textComplete':
          if (currentAssistantBubble) {
            currentAssistantBubble.textContent = msg.text;
          } else {
            addBubble('assistant', msg.text);
          }
          currentAssistantBubble = null;
          break;
        case 'toolCall':
          addBadge('\\u2699 ' + msg.name, 'tool-call');
          break;
        case 'toolResult':
          addBadge(msg.isError ? '\\u2717 ' + msg.name : '\\u2713 ' + msg.name, msg.isError ? 'tool-error' : 'tool-ok');
          break;
        case 'agentList':
          agentSelect.innerHTML = '<option value="">Free-form</option>';
          msg.agents.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a;
            opt.textContent = a;
            agentSelect.appendChild(opt);
          });
          break;
        case 'agentSelected':
          agentSelect.value = msg.name;
          break;
        case 'clearHistory':
          messages.innerHTML = '';
          currentAssistantBubble = null;
          break;
        case 'error':
          addBubble('error', msg.message);
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
