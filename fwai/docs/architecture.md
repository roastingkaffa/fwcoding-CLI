# fwai 架構文件 (Architecture Document)

> 版本 0.1.0 | 最後更新：2026-02-28

---

## 目錄

1. [系統概覽](#1-系統概覽)
2. [目錄結構](#2-目錄結構)
3. [分層架構](#3-分層架構)
4. [核心元件詳解](#4-核心元件詳解)
5. [資料流程](#5-資料流程)
6. [Schema 系統](#6-schema-系統)
7. [LLM Provider 抽象層](#7-llm-provider-抽象層)
8. [Agentic Loop 引擎](#8-agentic-loop-引擎)
9. [工具系統](#9-工具系統)
10. [Skill / Agent 系統](#10-skill--agent-系統)
11. [Evidence 追蹤系統](#11-evidence-追蹤系統)
12. [安全與合規架構](#12-安全與合規架構)
13. [插件系統](#13-插件系統)
14. [VS Code 擴充功能架構](#14-vs-code-擴充功能架構)
15. [關鍵設計決策](#15-關鍵設計決策)
16. [依賴關係](#16-依賴關係)
17. [Phase 開發歷程](#17-phase-開發歷程)

---

## 1. 系統概覽

fwai 是一套 AI 驅動的韌體開發 CLI 工具，結合了：

- **Agentic AI Loop** — LLM 可自主呼叫工具完成複雜任務
- **Evidence 追蹤** — 每次操作留下不可篡改的稽核紀錄
- **安全策略引擎** — 受保護路徑、變更預算、Flash guard
- **多 Provider 支援** — Anthropic / OpenAI / Gemini / Ollama
- **插件市集** — 社群貢獻的工具、Skill、Agent

```
┌─────────────────────────────────────────────────────────────┐
│                       使用者介面                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────────┐  │
│  │   CLI    │  │   REPL   │  │   VS Code Extension       │  │
│  └────┬─────┘  └────┬─────┘  └───────────┬───────────────┘  │
│       │              │                     │                  │
├───────┴──────────────┴─────────────────────┴──────────────────┤
│                     命令路由 & 意圖解析                        │
│  ┌──────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │ Commands │  │ Intent      │  │ Skill Runner             │ │
│  │ Router   │  │ Resolver    │  │ (tool/evidence/agentic)  │ │
│  └────┬─────┘  └──────┬──────┘  └───────────┬──────────────┘ │
│       │                │                      │               │
├───────┴────────────────┴──────────────────────┴───────────────┤
│                     核心引擎層                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │ Agentic Loop │  │ Tool         │  │ Agent Runtime        ││
│  │ Engine       │  │ Registry     │  │ (scope/prompt/model) ││
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘│
│         │                  │                      │           │
├─────────┴──────────────────┴──────────────────────┴───────────┤
│                     Provider 抽象層                            │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │ Anthropic │ │ OpenAI   │ │ Gemini   │ │ Ollama (local)   ││
│  └───────────┘ └──────────┘ └──────────┘ └──────────────────┘│
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                     基礎設施層                                 │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│  │ Evidence  │ │ Policy   │ │ KB/RAG │ │ MCP    │ │ Board  │ │
│  │ System    │ │ Engine   │ │ Search │ │ Bridge │ │ Farm   │ │
│  └──────────┘ └──────────┘ └────────┘ └────────┘ └────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐            │
│  │ Security │ │ SBOM     │ │ OTA    │ │ GDB    │            │
│  │ Scanner  │ │ Generator│ │ Manager│ │ Session│            │
│  └──────────┘ └──────────┘ └────────┘ └────────┘            │
├───────────────────────────────────────────────────────────────┤
│                     資料層                                     │
│  ┌──────────────────┐  ┌───────────────┐  ┌────────────────┐ │
│  │ .fwai/config.yaml│  │ .fwai/runs/   │  │ .fwai/plugins/ │ │
│  │ .fwai/project.yaml│ │ evidence.json │  │ manifest.json  │ │
│  │ .fwai/tools/     │  │ *.log files   │  │ tools/skills/  │ │
│  │ .fwai/skills/    │  │ signatures    │  │ agents/        │ │
│  │ .fwai/agents/    │  │ sbom.json     │  │                │ │
│  └──────────────────┘  └───────────────┘  └────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. 目錄結構

### 原始碼 (`fwai/src/`)

```
src/
├── cli.ts                    # CLI 進入點 (commander.js)
├── repl.ts                   # 互動式 REPL + AppContext
├── lib.ts                    # 公開 API re-exports
│
├── schemas/                  # Zod 驗證 Schema
│   ├── config.schema.ts      #   全域設定
│   ├── project.schema.ts     #   專案描述
│   ├── tool.schema.ts        #   工具定義
│   ├── skill.schema.ts       #   Skill 工作流程
│   ├── agent.schema.ts       #   Agent 設定
│   ├── evidence.schema.ts    #   Evidence 紀錄
│   ├── mcp.schema.ts         #   MCP 伺服器
│   ├── kb.schema.ts          #   Knowledge Base
│   ├── board-farm.schema.ts  #   Board Farm
│   ├── ota.schema.ts         #   OTA 更新
│   ├── license.schema.ts     #   授權與雲端
│   └── marketplace.schema.ts #   插件市集
│
├── providers/                # LLM Provider 抽象層
│   ├── provider.ts           #   LLMProvider 介面
│   ├── tool-types.ts         #   ContentBlock / ToolMessage 型別
│   ├── anthropic.ts          #   Anthropic Claude 實作
│   ├── openai.ts             #   OpenAI GPT 實作
│   ├── gemini.ts             #   Google Gemini 實作
│   ├── ollama.ts             #   Ollama 本地 LLM 實作
│   └── provider-factory.ts   #   Provider 工廠函式
│
├── tools/                    # Agentic 工具（LLM 可呼叫）
│   ├── tool-interface.ts     #   AgenticTool / ToolExecutionContext
│   ├── tool-registry.ts      #   ToolRegistry (register/scope/execute)
│   ├── bash.ts               #   Shell 命令執行
│   ├── read-file.ts          #   檔案讀取
│   ├── write-file.ts         #   檔案寫入
│   ├── edit-file.ts          #   精確文字替換
│   ├── search-grep.ts        #   正規表達式搜尋
│   ├── search-glob.ts        #   檔案名稱搜尋
│   ├── gdb.ts                #   GDB 命令
│   └── memory-analysis.ts    #   記憶體分析輔助
│
├── agents/                   # Agent 系統
│   ├── agentic-loop.ts       #   核心 Agentic Loop 引擎
│   ├── agent-loader.ts       #   Agent YAML 載入
│   ├── agent-runtime.ts      #   Agent 執行設定建構
│   └── orchestrator.ts       #   多 Agent 編排
│
├── skills/                   # Skill 系統
│   ├── skill-loader.ts       #   Skill YAML 載入
│   ├── skill-runner.ts       #   Skill 步驟執行引擎
│   └── intent-resolver.ts    #   三層意圖解析
│
├── core/                     # 核心業務邏輯
│   ├── config-loader.ts      #   組態/專案/工具/Agent/Skill 載入
│   ├── workspace.ts          #   工作區初始化
│   ├── evidence.ts           #   Evidence 建立/儲存/讀取
│   ├── policy.ts             #   安全策略引擎
│   ├── runner.ts             #   工具執行引擎（for Skill steps）
│   ├── kb-loader.ts          #   Knowledge Base 載入/搜尋
│   ├── kb-embeddings.ts      #   KB 嵌入向量 & 語意搜尋
│   ├── mcp-bridge.ts         #   MCP 協定橋接
│   ├── mcp-manager.ts        #   MCP 伺服器生命週期管理
│   ├── board-farm.ts         #   Board Farm 客戶端
│   ├── license-manager.ts    #   授權驗證/快取
│   ├── plugin-loader.ts      #   插件載入/安裝/移除
│   ├── plugin-registry.ts    #   插件市集客戶端
│   ├── cloud-sync.ts         #   雲端同步
│   ├── ota-manager.ts        #   OTA 套件/部署/回滾
│   ├── gdb-session.ts        #   GDB 批次執行/解析
│   ├── openocd-session.ts    #   OpenOCD 伺服器管理
│   ├── audit-export.ts       #   稽核匯出（JSON/CSV/SARIF/HTML）
│   ├── secret-scanner.ts     #   秘密掃描與脫敏
│   ├── evidence-signer.ts    #   Ed25519 簽章
│   ├── sbom-generator.ts     #   CycloneDX SBOM 生成
│   ├── org-policy.ts         #   組織策略載入/合併
│   ├── supply-chain.ts       #   供應鏈安全
│   └── ci-helpers.ts         #   CI 環境偵測/摘要
│
├── commands/                 # REPL 指令處理器
│   ├── index.ts              #   指令註冊表 & 路由
│   ├── help.ts               #   /help
│   ├── build.ts              #   /build
│   ├── flash.ts              #   /flash
│   ├── monitor.ts            #   /monitor
│   ├── evidence.ts           #   /evidence
│   ├── agents.ts             #   /agents
│   ├── skills.ts             #   /skills
│   ├── config.ts             #   /config
│   ├── doctor.ts             #   /doctor
│   ├── agent-chat.ts         #   /agent <name>
│   ├── audit.ts              #   /audit
│   ├── license.ts            #   /license
│   ├── marketplace.ts        #   /marketplace
│   ├── ota.ts                #   /ota
│   ├── debug.ts              #   /debug
│   ├── security.ts           #   /security
│   ├── policy.ts             #   /policy
│   ├── provider.ts           #   /provider
│   ├── memory.ts             #   /memory
│   ├── farm.ts               #   /farm
│   ├── mcp.ts                #   /mcp
│   └── kb.ts                 #   /kb
│
└── utils/                    # 通用輔助工具
    ├── logger.ts             #   多層級日誌 (debug/info/warn/error)
    ├── paths.ts              #   路徑解析 (.fwai/ 相關)
    ├── project-context.ts    #   專案上下文建構
    ├── llm-tracer.ts         #   LLM 呼叫追蹤 & 成本估算
    ├── ui.ts                 #   CLI UI 輔助（spinner/table）
    ├── interpolate.ts        #   字串變數插值 ($VAR)
    └── run-mode.ts           #   互動/CI 模式解析
```

### VS Code 擴充功能 (`vscode-fwai/src/`)

```
src/
├── extension.ts              # 擴充功能進入點
├── types.ts                  # 本地型別定義（鏡像 fwai schemas）
├── lib/
│   ├── fwai-bridge.ts        # fwai CLI 橋接
│   └── cli-runner.ts         # 子程序執行
├── views/
│   ├── agents-tree.ts        # Agent 樹狀面板
│   ├── skills-tree.ts        # Skill 樹狀面板
│   ├── tools-tree.ts         # Tool 樹狀面板
│   └── evidence-tree.ts      # Evidence 樹狀面板
├── panels/
│   ├── chat-panel.ts         # AI 對話 WebView
│   ├── evidence-detail.ts    # Evidence 詳情 WebView
│   └── memory-panel.ts       # 記憶體分析 WebView
├── providers/
│   ├── diagnostics.ts        # 診斷（linting）
│   └── tasks.ts              # VS Code Task Provider
└── statusbar/
    └── status-bar.ts         # 狀態列項目
```

---

## 3. 分層架構

fwai 採用**五層架構**，由上至下依賴：

### Layer 1: 介面層 (Interface)

| 元件 | 檔案 | 職責 |
|------|------|------|
| CLI | `cli.ts` | 命令列進入點，解析旗標，路由子命令 |
| REPL | `repl.ts` | 互動式 shell，維護對話歷史 |
| VS Code | `vscode-fwai/` | IDE 整合（透過 fwai-bridge 呼叫 CLI） |

### Layer 2: 指令 & 意圖層 (Command & Intent)

| 元件 | 檔案 | 職責 |
|------|------|------|
| Command Router | `commands/index.ts` | `/command` 路由至 handler |
| Intent Resolver | `skills/intent-resolver.ts` | 自然語言 → Skill 匹配 |
| Skill Runner | `skills/skill-runner.ts` | 多步驟 Skill 執行 |

### Layer 3: 核心引擎層 (Engine)

| 元件 | 檔案 | 職責 |
|------|------|------|
| Agentic Loop | `agents/agentic-loop.ts` | LLM ↔ Tool 交互循環 |
| Tool Registry | `tools/tool-registry.ts` | 工具註冊/範圍限定/執行 |
| Agent Runtime | `agents/agent-runtime.ts` | Agent 設定建構 |

### Layer 4: Provider & 基礎設施層

| 元件 | 檔案 | 職責 |
|------|------|------|
| LLM Providers | `providers/*.ts` | 多 Provider 統一介面 |
| Evidence | `core/evidence.ts` | 執行紀錄追蹤 |
| Policy | `core/policy.ts` | 安全策略執行 |
| MCP Bridge | `core/mcp-bridge.ts` | MCP 協定橋接 |
| KB/RAG | `core/kb-loader.ts` | 知識庫搜尋 |
| Board Farm | `core/board-farm.ts` | 硬體 Farm 客戶端 |

### Layer 5: 資料層 (Data)

| 元件 | 位置 | 職責 |
|------|------|------|
| Config | `.fwai/config.yaml` | 全域設定 |
| Project | `.fwai/project.yaml` | 專案描述 |
| YAML 定義 | `.fwai/tools/ skills/ agents/` | 宣告式定義 |
| Evidence | `.fwai/runs/` | 執行紀錄（JSON + logs） |
| Schemas | `src/schemas/*.ts` | Zod 驗證規則 |

---

## 4. 核心元件詳解

### 4.1 CLI 進入點 (`cli.ts`)

```
fwai [command] [options]
  ├── init           → workspace.initWorkspace()
  ├── doctor         → commands/doctor.handleDoctor()
  ├── run <skill>    → skill-runner.runSkill() [CI mode]
  ├── ota <sub>      → commands/ota.handleOTA()
  ├── audit <sub>    → commands/audit.handleAudit()
  └── (default)      → repl.startRepl()
```

**關鍵函式**：
- `buildAppContext()` — 組裝 AppContext（config + project + tools + provider + flags）
- CI 模式：設定 watchdog timer，結束時輸出 JSON 摘要

### 4.2 REPL (`repl.ts`)

**AppContext** 是貫穿所有 handler 的共享上下文：

```typescript
interface AppContext {
  config: Config;              // 全域設定
  project: Project;            // 專案描述
  tools: Map<string, ToolDef>; // 工具定義
  projectCtx: ProjectContext;  // 專案上下文（for LLM prompt）
  provider: LLMProvider | null;// 當前 LLM Provider
  variables: Record<string, unknown>;
  runMode: RunMode;            // "interactive" | "ci"
  cliFlags: { ci?, yes?, json?, quiet? };
  confirm: (msg) => Promise<boolean>;
  license?: LicenseStatus;
  orgPolicy?: OrgPolicy;
  mcpManager?: MCPManager;     // Phase 6
  boardFarmClient?: BoardFarmClient; // Phase 6
}
```

**輸入處理流程**：

```
使用者輸入 → queue.push()
  ↓
drainQueue()
  ↓
confirmResolver 等待中? → 餵入確認回應
  ↓ (否)
input.startsWith("/") ?
  ├── 是 → routeCommand(input, ctx)
  └── 否 → handleNaturalLanguage(input, ctx)
              ├── resolveIntent() → skill match?
              │     ├── confidence ≥ 0.8 → 自動執行
              │     ├── confidence ≥ 0.6 → 詢問確認
              │     └── < 0.6 → 自由對話
              └── 自由對話
                    ├── provider.supportsToolCalling()
                    │     ├── true → runAgenticLoop()
                    │     └── false → provider.complete()
                    └── 顯示回應
```

### 4.3 Config Loader (`core/config-loader.ts`)

統一載入所有 YAML 設定：

```
loadConfig()   → .fwai/config.yaml   → ConfigSchema.parse()
loadProject()  → .fwai/project.yaml  → ProjectSchema.parse()
loadTools()    → .fwai/tools/*.yaml  → ToolDefSchema.parse() + plugin tools
loadAgents()   → .fwai/agents/*.yaml → AgentConfigSchema.parse() + plugin agents
loadSkills()   → .fwai/skills/*.yaml → SkillConfigSchema.parse() + plugin skills
```

---

## 5. 資料流程

### 5.1 Build → Flash → Monitor 流程

```
/build
  → runner.runTool(buildToolDef)
    → execSync("cmake --build build")
    → 匹配 success/failure patterns
    → 建立 ToolResult
  → evidence.writeEvidence(session)
    → 計算 git diff
    → 簽章（if enabled）
    → SBOM（if enabled）
    → 秘密掃描
    → 儲存 evidence.json

/flash
  → policy.checkFlashGuard()  — 確認最近建置成功
  → ctx.confirm("Flash?")     — 使用者確認
  → runner.runTool(flashToolDef)
  → evidence.writeEvidence()

/monitor
  → runner.runTool(monitorToolDef)
    → 匹配 boot success/failure patterns
  → evidence.writeEvidence(session, bootStatus)
```

### 5.2 Agentic Loop 資料流

```
使用者: "幫我修改 UART 波特率"
  ↓
runAgenticLoop(userMessage, history, config)
  ↓
Loop iteration 1:
  provider.completeWithTools({
    messages: [...history, {role: "user", content: "幫我修改 UART 波特率"}],
    tools: [read_file, write_file, edit_file, grep, glob, bash],
    system: projectContext + agentPrompt
  })
  ↓
  Response: {
    content: [
      {type: "text", text: "讓我先查看 UART 設定..."},
      {type: "tool_use", id: "tu_1", name: "grep", input: {pattern: "baud", path: "src/"}}
    ],
    stop_reason: "tool_use"
  }
  ↓
  Execute tool: grep({pattern: "baud", path: "src/"})
  → ToolExecutionResult: {content: "src/uart.c:42: #define BAUD 9600", is_error: false}
  ↓
  Append to history:
    assistant: [TextBlock("讓我先查看..."), ToolUseBlock("grep")]
    user: [ToolResultBlock("src/uart.c:42: #define BAUD 9600")]
  ↓
Loop iteration 2:
  provider.completeWithTools({messages: [... + tool result]})
  ↓
  Response: {
    content: [{type: "text", text: "找到了，UART 設定在 src/uart.c:42..."}],
    stop_reason: "end_turn"
  }
  ↓
  return AgenticLoopResult {
    messages: [全部對話歷史],
    finalText: "找到了，UART 設定在...",
    toolCallCount: 1,
    iterations: 2
  }
```

### 5.3 Evidence 資料結構

```json
{
  "run_id": "20260228-161234-build",
  "skill": "build_and_test",
  "status": "success",
  "start_time": "2026-02-28T16:12:34.567Z",
  "end_time": "2026-02-28T16:12:36.890Z",
  "duration_ms": 2323,
  "tools": [{
    "tool": "build",
    "command": "cmake --build build",
    "exit_code": 0,
    "duration_ms": 2100,
    "log_file": "build.log",
    "status": "success"
  }],
  "changes": {
    "files_changed": 2,
    "lines_added": 15,
    "lines_removed": 3,
    "diff_path": "changes.diff",
    "within_budget": true
  },
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "calls": [{ "purpose": "free_chat", "input_tokens": 1234, "output_tokens": 567 }],
    "total_input_tokens": 1234,
    "total_output_tokens": 567,
    "estimated_cost_usd": 0.0084
  },
  "project": { "name": "my-stm32-project", "target_mcu": "STM32F401CCU6" },
  "signature": { "algorithm": "ed25519", "public_key": "...", "signature": "..." },
  "sbom": { "format": "cyclonedx", "version": "1.4", "components": [...] }
}
```

---

## 6. Schema 系統

所有組態使用 **Zod** 進行嚴格型別驗證。

### Schema 依賴圖

```
ConfigSchema
├── ProviderConfigSchema
├── PolicySchema
├── IntentConfigSchema
├── ModeSchema → CIModeSchema
├── LoggingSchema
├── SecurityConfigSchema
├── OrgPolicyConfigSchema
├── BoardFarmConfigSchema     (from board-farm.schema.ts)
├── MCPConfigSchema           (from mcp.schema.ts)
├── KBConfigSchema            (from kb.schema.ts)
├── LicenseSchema             (from license.schema.ts)
└── CloudConfigSchema         (from license.schema.ts)

ProjectSchema
├── TargetSchema
├── BuildConfigSchema
├── SerialConfigSchema
├── BootConfigSchema
├── ToolchainConfigSchema
├── OTAProjectSchema
└── ProjectDependencySchema

EvidenceSchema
├── ToolResultSchema
├── ChangesSchema
├── BootStatusSchema
├── LLMTracingSchema → LLMCallSchema
├── AgenticSessionSchema → AgenticCallSchema
├── HardwareStateSchema
├── OTAEvidenceSchema
├── DebugEvidenceSchema
├── EvidenceSignatureSchema
├── EvidenceSBOMSchema
└── EvidenceSecuritySchema
```

### 設計原則

1. **所有選填欄位使用 `.optional()` 或 `.default()`** — 向後相容
2. **型別從 Schema 推導**：`type Config = z.infer<typeof ConfigSchema>`
3. **驗證在載入時執行**：`ConfigSchema.parse(yamlContent)`
4. **Schema 定義與業務邏輯分離**：`schemas/` 只定義結構

---

## 7. LLM Provider 抽象層

### 介面設計

```typescript
interface LLMProvider {
  name: string;
  init(config: ProviderInitConfig): Promise<void>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  supportsToolCalling(): boolean;
  completeWithTools?(request: ToolCompletionRequest): Promise<ToolCompletionResponse>;
  completeWithToolsStreaming?(request: ToolCompletionRequest, callbacks: StreamCallbacks): Promise<ToolCompletionResponse>;
  isReady(): boolean;
  status(): ProviderStatus;
}
```

### 統一 ContentBlock 協定

所有 Provider 將 API 回應轉換為統一的 `ContentBlock` 格式：

```typescript
type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// TextBlock:      {type: "text", text: string}
// ToolUseBlock:   {type: "tool_use", id: string, name: string, input: object}
// ToolResultBlock:{type: "tool_result", tool_use_id: string, content: string, is_error?: boolean}
```

### Provider 對照表

| Provider | text | tool_use | streaming | tool_call_id 映射 |
|----------|------|----------|-----------|-------------------|
| Anthropic | `text` block | `tool_use` block | `messages.stream()` | 原生支援 `id` 欄位 |
| OpenAI | `message.content` | `message.tool_calls[]` | `stream: true` | `tool_calls[].id` → `ToolUseBlock.id` |
| Gemini | `text` part | `functionCall` part | N/A (MVP) | `functionCall` → `ToolUseBlock` |
| Ollama | `message.content` | `message.tool_calls[]` | N/A (MVP) | 同 OpenAI 格式 |

### Provider 工廠

```typescript
async function createProvider(config: ProviderConfig): Promise<LLMProvider> {
  switch (config.name) {
    case "anthropic": return new AnthropicProvider();
    case "openai":    return new OpenAIProvider();
    case "gemini":    return new GeminiProvider();
    case "local":
    case "ollama":    return new OllamaProvider();
  }
}
```

---

## 8. Agentic Loop 引擎

### 核心演算法

```
function runAgenticLoop(userMessage, history, config):
  history.push({role: "user", content: userMessage})
  iterations = 0

  while iterations < maxIterations:
    iterations++

    // 呼叫 LLM
    if config.streaming && provider.completeWithToolsStreaming:
      response = await provider.completeWithToolsStreaming(request, callbacks)
    else:
      response = await provider.completeWithTools(request)

    // 處理回應
    history.push({role: "assistant", content: response.content})

    if response.stop_reason !== "tool_use":
      break  // LLM 完成回答

    // 執行工具
    toolUseBlocks = extractToolUseBlocks(response.content)
    resultBlocks = []

    for each toolUse in toolUseBlocks:
      result = await registry.execute(toolUse.name, toolUse.input, context)
      resultBlocks.push(toolResultBlock(toolUse.id, result.content, result.is_error))
      trackMetadata(result.metadata)

    // 將工具結果送回 LLM
    history.push({role: "user", content: resultBlocks})

  return {messages: history, finalText, toolCallCount, iterations, filesRead, filesWritten}
```

### Streaming 架構

```
Provider stream
  ├── onTextDelta(chunk) → process.stdout.write(chunk)
  ├── onToolUseStart(id, name) → log.info("Tool: name")
  └── finalMessage → 解析 ContentBlock[]
```

---

## 9. 工具系統

### ToolRegistry 架構

```
ToolRegistry
├── Map<name, AgenticTool>
├── register(tool)         — 註冊工具
├── get(name)              — 取得工具
├── getDefinitions()       — 取得 LLM 工具定義
├── execute(name, input, ctx)
│     ├── 查找工具
│     ├── 執行 tool.execute(input, ctx)
│     └── 回傳 ToolExecutionResult
├── createScoped(names)    — 建立範圍限定 Registry（for Agent）
└── createDefault(fwTools) — 工廠：內建工具 + firmware 工具
```

### 工具安全性

```
ToolExecutionContext
├── cwd               — 工作目錄
├── allowedPaths      — Agent 可存取的路徑（glob）
├── protectedPaths    — 禁止寫入的路徑（glob）
├── policy            — 策略設定
└── confirm           — 破壞性操作確認

寫入前檢查流程：
  1. protectedPaths 檢查 → 拒絕匹配的路徑
  2. allowedPaths 檢查（if set） → 僅允許匹配的路徑
  3. 執行寫入
```

### MCP 工具整合

```
MCPConnection.listTools() → MCPToolInfo[]
  ↓
wrapMCPTool(toolInfo, connection, serverName)
  ↓
AgenticTool {
  definition: {
    name: "mcp_{serverName}_{toolName}",
    description: "[MCP:{serverName}] {description}",
    input_schema: toolInfo.input_schema
  },
  execute: (input) → connection.callTool(toolName, input)
}
  ↓
registry.register(wrappedTool)
```

---

## 10. Skill / Agent 系統

### Skill 執行流程

```
Skill Definition (YAML)
  steps:
    - {tool: build, on_fail: abort}
    - {tool: test, on_fail: continue}
    - {action: evidence}
    - {action: llm_analyze, input: "build.log", prompt: "..."}
    - {action: agentic, goal: "...", agent: "bsp"}

SkillRunner:
  for each step:
    switch step.type:
      "tool":
        result = runTool(toolDef, options)
        if failed && on_fail === "abort": throw
        if failed && on_fail === "retry": retry once
        if failed && on_fail === "continue": continue

      "evidence":
        writeEvidence(session)

      "llm_analyze":
        readFile(step.input)
        provider.complete({prompt: step.prompt, input: fileContent})

      "agentic":
        agent = getAgent(step.agent)
        config = createAgentLoopConfig(agent)
        runAgenticLoop(step.goal, [], config)
```

### Agent 範圍限定

```
createAgentLoopConfig(agent, opts):
  // 1. 建立範圍限定的 ToolRegistry
  scopedRegistry = registry.createScoped(agent.tools)

  // 2. 合併受保護路徑
  protectedPaths = [...policy.protected_paths, ...agent.protected_paths]

  // 3. 建構 AgenticLoopConfig
  return {
    provider: resolveModel(agent.model),
    registry: scopedRegistry,
    systemPrompt: buildAgentSystemPrompt(agent, projectCtx),
    context: {
      cwd: process.cwd(),
      allowedPaths: agent.allowed_paths,
      protectedPaths
    },
    maxIterations: agent.max_iterations,
    temperature: agent.temperature
  }
```

---

## 11. Evidence 追蹤系統

### Evidence 生命週期

```
1. createRunSession(label)
   → 建立 .fwai/runs/{run_id}/ 目錄
   → 回傳 RunSession {runId, runDir, toolResults[], startTime}

2. 執行工具 → session.toolResults.push(result)

3. writeEvidence(session, projectCtx, opts)
   → 編譯 Evidence 物件
   → git diff --numstat → Changes
   → globalTracer.getCalls() → LLM tracing
   → signEvidence() (if signing enabled)
   → generateSBOM() (if sbom enabled)
   → scanEvidence() (if security enabled)
   → 寫入 evidence.json
   → appendToAuditLog() (if audit enabled)
   → syncRunToCloud() (if cloud enabled)
```

### 稽核鏈 (Audit Chain)

```
computeChainHash(evidence[]):
  hash = SHA-256("")
  for each evidence in chronological order:
    hash = SHA-256(hash + JSON.stringify(evidence))
  return hash

verifyChainHash(runId):
  evidence = loadAllEvidenceUpTo(runId)
  computed = computeChainHash(evidence)
  stored = loadStoredHash(runId)
  return computed === stored
```

---

## 12. 安全與合規架構

### 安全層級

```
Layer 1: 路徑保護
  ├── protected_paths (glob patterns)
  └── allowed_paths (agent scope)

Layer 2: 變更預算
  ├── max_files_changed
  └── max_lines_changed

Layer 3: Flash Guard
  ├── require_confirmation
  └── require_build_success

Layer 4: Evidence 完整性
  ├── Ed25519 數位簽章
  └── SHA-256 鏈式雜湊

Layer 5: 秘密掃描
  ├── 自訂 regex patterns
  ├── Evidence 脫敏
  └── Log 脫敏

Layer 6: 供應鏈
  ├── npm audit
  ├── 插件完整性驗證
  └── 工具鏈二進位檢查

Layer 7: 合規模式
  ├── ISO 26262
  ├── DO-178C
  └── IEC 62443
```

### 組織策略合併

```
Project Policy (config.yaml)
  ↓ mergePolicy()
Org Policy (org-policy.yaml or URL)
  ↓
Merged Policy = {
  ...projectPolicy,
  ...orgPolicy.overrides,
  blocked_tools: union(project, org),
  allowed_tools: intersection(project, org) or org
}
```

---

## 13. 插件系統

### 插件生命週期

```
/marketplace search <query>
  → plugin-registry.searchRegistry(query, registryUrl)
  → HTTP GET registry.fwai.dev/search?q=query

/marketplace install <name>
  → plugin-registry.getPackageInfo(name)
  → 下載 tarball → 解壓至 .fwai/plugins/<name>/
  → 驗證 manifest.json

載入時：
  loadPluginArtifacts()
  → 遍歷 .fwai/plugins/*/
  → 載入各插件的 tools/, skills/, agents/
  → 合併至全域 Map
```

### 插件 Manifest

```json
{
  "name": "stm32-bsp-tools",
  "version": "1.2.0",
  "description": "STM32 BSP 工具集",
  "author": "fwai-community",
  "artifacts": {
    "tools": ["stm32-clock-config", "stm32-pinout"],
    "skills": ["stm32-init"],
    "agents": ["stm32-expert"]
  },
  "checksum": "sha256:..."
}
```

---

## 14. VS Code 擴充功能架構

### 通訊架構

```
VS Code Extension
  ↓ (child_process.exec)
fwai CLI (fwai-bridge.ts)
  ↓
回傳 JSON/文字
  ↓
解析並更新 UI

特殊情況（WebView 面板）：
  Chat Panel ←postMessage→ Extension Host ←exec→ fwai CLI
```

### WebView 面板

```
Extension Host (Node.js)
├── ChatPanel
│   ├── createWebviewPanel()
│   ├── postMessage({type: "user-input", text: "..."})
│   └── onMessage({type: "response", text: "..."})
├── EvidenceDetail
│   └── loadEvidence(runId) → 顯示 HTML
└── MemoryPanel
    └── analyzeMemory(elfPath) → 顯示圖表
```

---

## 15. 關鍵設計決策

### 1. Anthropic-style ContentBlock 作為統一協定

**決策**：所有 Provider 轉換為 Anthropic 風格的 `ContentBlock[]`

**理由**：Agentic Loop 引擎只需實作一套邏輯，格式轉換封裝在各 Provider 內部

### 2. Schema-First 開發

**決策**：所有 YAML/JSON 結構先定義 Zod Schema

**理由**：型別安全、自動驗證、清晰的錯誤訊息、單一事實來源

### 3. Evidence 作為一等公民

**決策**：每次操作產生不可篡改的 Evidence 紀錄

**理由**：韌體開發需要嚴格的追蹤性（ISO 26262、DO-178C），AI 操作更需要紀錄

### 4. 三層意圖解析

**決策**：Exact → Keyword → LLM 三層遞進

**理由**：快速路徑避免不必要的 LLM 呼叫，降低延遲和成本

### 5. 工具範圍限定（Scoped Registry）

**決策**：Agent 使用 `createScoped()` 限制可用工具

**理由**：最小權限原則，BSP Agent 不需要 OTA 工具

### 6. Queue-based Confirm

**決策**：REPL 使用 queue + resolver 模式處理確認

**理由**：支援 piped stdin（CI 場景），避免 readline 交互衝突

### 7. 無外部向量資料庫

**決策**：KB 嵌入向量存為扁平 JSON (`.fwai/kb/.embeddings.json`)

**理由**：保持自包含，無需外部服務，適合嵌入式開發環境

### 8. MCP 使用 stdio JSON-RPC

**決策**：自行實作輕量 JSON-RPC transport，不依賴 MCP client SDK

**理由**：減少依賴，保持最小化

---

## 16. 依賴關係

### 執行時依賴

| 套件 | 版本 | 用途 |
|------|------|------|
| `@anthropic-ai/sdk` | ^0.39.0 | Anthropic Claude API |
| `openai` | ^4.85.0 | OpenAI GPT API |
| `@google/generative-ai` | ^0.21.0 | Google Gemini API |
| `commander` | ^13.1.0 | CLI 框架 |
| `zod` | ^3.24.0 | Schema 驗證 |
| `yaml` | ^2.7.0 | YAML 解析 |
| `ora` | ^8.2.0 | CLI spinner |
| `minimatch` | ^10.2.3 | Glob 模式匹配 |

### 開發依賴

| 套件 | 用途 |
|------|------|
| `typescript` ^5.7.0 | TypeScript 編譯器 |
| `jest` ^29.7.0 | 測試框架 |
| `ts-jest` ^29.2.0 | Jest TypeScript 支援 |
| `@types/node` ^22.13.0 | Node.js 型別定義 |

### 系統依賴（可選）

| 工具 | 用途 |
|------|------|
| `arm-none-eabi-gcc` | ARM 交叉編譯 |
| `arm-none-eabi-gdb` | ARM 除錯 |
| `openocd` | 晶片除錯 |
| `ripgrep` (rg) | 快速搜尋（grep fallback） |

---

## 17. Phase 開發歷程

| Phase | 內容 | 狀態 |
|-------|------|------|
| Phase 1 | CLI 骨架、REPL、基礎 Schema、工具執行、Evidence 系統 | 完成 |
| Phase 2 | Agentic Loop、Tool Registry、Agent Runtime、意圖解析 | 完成 |
| Phase 3 | 多 Agent 編排、Skill 系統、Knowledge Base、MCP stub、Board Farm stub | 完成 |
| Phase 4 | 插件市集、授權管理、OTA 更新、GDB 除錯、稽核匯出 | 完成 |
| Phase 5 | Ed25519 簽章、SBOM、秘密掃描、供應鏈安全、CI/CD、組織策略 | 完成 |
| Phase 6 | 真實 MCP 整合、多 Provider 對等、語意 KB/RAG、Board Farm 客戶端 | 進行中 |
| Phase 7 | Agent 記憶/對話持久化、OpenTelemetry 可觀測性 | 計畫中 |
