# fwai 架構文件 (Architecture Document)

> 版本 0.1.0 | 最後更新：2026-08-15 | 對照 commit `8017fb1`

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
- **多 Provider 支援** — Anthropic / OpenAI（介面已抽象，其他 provider 尚未實作）
- **插件市集** — 社群貢獻的工具、Skill、Agent

> **本文件的準確度標示**
> 本專案是規格先行開發，部分章節描述的是 `Firmware-AI-CLI-spec.md` 的目標而非現況。
> 凡標記 **【未實作】** 的段落表示規格已定義但 `src/` 尚無對應程式碼；
> 未標記者皆已對照 commit `8e954a8` 的原始碼查核。

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
│  ┌───────────┐ ┌──────────┐ ┌──────────────────────────────┐│
│  │ Anthropic │ │ OpenAI   │ │ (其他 provider 尚未實作)      ││
│  └───────────┘ └──────────┘ └──────────────────────────────┘│
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
│   ├── gdb-tool.ts           #   GDB 命令
│   ├── firmware-tools.ts     #   將 YAML 韌體工具包裝成 agentic tool
│   ├── bash-validator.ts     #   bash 指令風險分級
│   ├── shell-escape.ts       #   POSIX shell 引數跳脫
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
│   ├── kb-loader.ts          #   Knowledge Base 載入/搜尋（關鍵字，非語意）
│   ├── mcp-bridge.ts         #   MCP 協定橋接
│   ├── mcp-manager.ts        #   MCP 伺服器生命週期管理
│   ├── mcp-stdio-connection.ts #  MCP stdio JSON-RPC 連線
│   ├── hooks.ts              #   pre/post tool-use hook
│   ├── session-store.ts      #   REPL 對話持久化 (JSONL)
│   ├── diff.ts               #   git diff 產生與解析
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
│   ├── sessions.ts           #   /sessions
│   ├── provider.ts           #   /provider
│   ├── memory.ts             #   /memory
│   └── farm.ts               #   /farm
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
| Orchestrator | `agents/orchestrator.ts` | 多 Agent 併發（semaphore，預設 3） |
| Context Manager | `agents/context-manager.ts` | 上下文估算與壓縮 |
| Tool Runner | `core/runner.ts` | YAML 韌體工具的程序執行與 pattern 比對 |

### Layer 4: Provider & 基礎設施層

| 元件 | 檔案 | 職責 |
|------|------|------|
| LLM Providers | `providers/*.ts` | 多 Provider 統一介面 |
| Evidence | `core/evidence.ts` | 執行紀錄追蹤 |
| Policy | `core/policy.ts` | 安全策略執行 |
| MCP Bridge | `core/mcp-bridge.ts` | MCP 協定橋接（stdio JSON-RPC） |
| KB | `core/kb-loader.ts` | 知識庫搜尋（關鍵字比對） |
| Board Farm | `core/board-farm.ts` | 硬體 Farm 客戶端（目前為 stub） |
| Hooks | `core/hooks.ts` | pre/post tool-use 攔截 |
| Session Store | `core/session-store.ts` | REPL 對話持久化（JSONL） |
| Evidence Signer | `core/evidence-signer.ts` | Ed25519 簽章與信任存放區驗證 |

### Layer 5: 資料層 (Data)

| 元件 | 位置 | 職責 |
|------|------|------|
| Config | `.fwai/config.yaml` | 全域設定 |
| Project | `.fwai/project.yaml` | 專案描述 |
| YAML 定義 | `.fwai/tools/ skills/ agents/` | 宣告式定義 |
| Evidence | `.fwai/runs/` | 執行紀錄（evidence.json + *.log + diff.patch） |
| Sessions | `.fwai/sessions/` | REPL 對話（JSONL，id 需符合 `[A-Za-z0-9_-]+`） |
| Keys | `.fwai/keys/` | `evidence.key`（私鑰，gitignored）+ `trusted/`（公鑰，進版控） |
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

**全域旗標**：`--provider`、`--model`、`--max-tokens`、`--temperature`、`--no-streaming`
（在 `buildAppContext()` 中覆寫 config）。

**關鍵函式**：
- `buildAppContext()` — 組裝 AppContext（config + project + tools + provider + flags），
  並在此載入快取授權、合併組織策略
- CI 模式：設定 watchdog timer，結束時輸出 JSON 摘要
- 進入點使用 `program.parseAsync().catch()`；若用 `parse()`，非同步 handler 一旦
  reject 會變成 unhandled rejection（噴原始 stack、離開碼也不對）

**離開碼**：`0` 成功、`1` 未處理錯誤、`2` 工具失敗、`3` flash guard 拒絕、
`4` 變更預算超標、`5` skill 不存在或 CI 不允許 REPL、`7` CI watchdog 逾時。

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
}
```

**輸入處理流程**：

```
使用者輸入（rl "line" 事件）
  ↓
confirmResolver 等待中?
  ├── 是 → 直接餵給 confirmResolver，不進佇列
  │        （進佇列會 deadlock：drainQueue 正卡在等待該 handler）
  └── 否 → queue.push() → drainQueue()
              ↓
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

Anthropic 的 `tool_use` 協定就是內部標準格式，OpenAI 的 function calling 在 provider 內轉譯過來。
**【未實作】** Gemini 與 Ollama provider 在規格中定義，但 `src/providers/` 目前只有上述兩家。

### Provider 工廠

```typescript
async function createProvider(config: ProviderConfig): Promise<LLMProvider> {
  switch (config.name) {
    case "anthropic": return new AnthropicProvider();
    case "openai":    return new OpenAIProvider();
    default:
      // config schema 的 enum 仍接受 "gemini" / "local"，但沒有對應實作，
      // 因此會警告後回退到 anthropic。
      log.warn(`Unknown provider "${config.name}", falling back to anthropic`);
      return new AnthropicProvider();
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

  while iterations < maxIterations:   // 預設 50
    iterations++

    // 每圈開頭檢查上下文用量，超過 80% 就壓縮舊訊息。
    // 切點會避開 tool_use / tool_result 配對，不讓孤兒 tool_result 留在開頭。
    if shouldCompress(history, maxContextTokens):
      history = await compressConversation(history, provider)

    // 呼叫 LLM
    if config.streaming && provider.completeWithToolsStreaming:
      response = await provider.completeWithToolsStreaming(request, callbacks)
    else:
      response = await provider.completeWithTools(request)

    // 處理回應
    history.push({role: "assistant", content: response.content})

    toolUseBlocks = extractToolUseBlocks(response.content)

    // 分岔看的是「有沒有 tool_use」，不是 stop_reason —— 被 max_tokens
    // 截斷的回合仍可能夾帶 tool_use，漏回 tool_result 會使對話協定失效。
    if toolUseBlocks.isEmpty():
      if response.stop_reason == "end_turn": break
      if response.stop_reason == "max_tokens" && continuations < 2:
        continuations++
        history.push({role: "user", content: "Please continue."})
        continue
      break   // refusal / stop_sequence / 續寫用盡：不推空訊息（API 會拒絕）

    continuations = 0
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
├── getFilteredDefinitions(names) — 只取指定工具的定義
├── setPreHooks(hooks) / setPostHooks(hooks)
├── execute(name, input, ctx)
│     ├── 查找工具（找不到 → 回傳錯誤字串，不拋例外）
│     ├── pre-tool-use hook → allow / deny / ask_user
│     │     ├── deny     → 回傳錯誤字串給模型（不中斷迴圈）
│     │     └── ask_user → ctx.confirm()，拒絕則取消
│     ├── 執行 tool.execute(input, ctx)
│     ├── post-tool-use hook（僅觀察，例外會被吞掉不影響主流程）
│     └── 回傳 ToolExecutionResult
├── createScoped(names)    — 建立範圍限定 Registry（for Agent）
└── createDefault(fwTools, opts) — 工廠：內建工具 + firmware 工具 + gdb
```

**內建工具（`BUILTIN_TOOLS`）**：`read_file`、`write_file`、`edit_file`、
`grep`、`glob`、`bash`、`memory_analysis`；另加 `gdb_debug`
（`createDefault` 預設註冊，可用 `{ enableGdb: false }` 停用）。

再往上會疊加兩層：`.fwai/tools/*.tool.yaml` 包裝成的韌體工具，
以及已連線 MCP 伺服器提供的工具。

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
   → generateDiff() → diff.patch + Changes；git branch / commit
   → globalTracer.getCalls() → LLM tracing（token 數與估算成本）
   → scanEvidence()      ← 秘密遮蔽必須在寫檔前，否則 API key 會永久留在 run 目錄
   → generateSBOM()      (if policy.require_sbom)
   → EvidenceSchema.parse()  ← 驗證失敗只警告不阻擋：寧可留下格式稍有出入的
                                紀錄，也不要因 schema 演進而整份證據消失
   → 寫入 evidence.json
   → signEvidence()      (if security.signing.enabled) → 再寫一次含簽章的版本
   → appendToAuditLog()  (if policy.audit_log.enabled)
   → syncRunToCloud()    (if cloud.sync_enabled，fire-and-forget)
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

Layer 4: Evidence 完整性與來源
  ├── Ed25519 數位簽章
  ├── 信任存放區（.fwai/keys/trusted/ 或 security.signing.trusted_keys）
  └── SHA-256 長度分隔鏈式雜湊

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

### 簽章驗證：完整性 ≠ 來源

`verifyEvidenceSignature(evidence, trustStore)` 回傳三個獨立判斷：

| 欄位 | 意義 |
|------|------|
| `integrity` | 簽章與內容相符（用證據檔內嵌的公鑰驗） |
| `trusted` | 該公鑰的指紋出現在信任存放區中 |
| `valid` | **兩者皆成立才為 true** |

只驗 `integrity` 是不夠的：攻擊者可以修改證據後用自己產生的金鑰重簽、
並把該公鑰一併嵌入檔案，這樣完整性檢查照樣會通過。
因此**未提供信任存放區時 `valid` 恆為 false**，不會退回舊的自我認證行為。

信任存放區以公鑰 SPKI DER 的 SHA-256 前 16 個 hex 字元為指紋索引。
`/security keygen` 會把新產生的公鑰放進 `.fwai/keys/trusted/`；
該目錄應該進版控（公鑰），而 `keys/*.key` 已被 gitignore（私鑰）。

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

擴充功能用**兩套機制**跟 fwai 溝通，依「會不會改變狀態」分流：

```
VS Code Extension Host
│
├── 執行類 → lib/cli-runner.ts
│     spawn(cliPath, args, { NO_COLOR: 1 })
│     ├── 逐行 stdout/stderr → OutputChannel（可即時顯示）
│     └── 離開碼 → 判斷成功/失敗
│     用於：init / build / flash / doctor / run-skill / provider
│
└── 讀取類 → lib/fwai-bridge.ts
      await import("fwai/lib")   ← 動態 import，結果快取
      用於：fwai-context / chat-panel / memory-panel
```

用 `spawn` 而非 `exec`，是為了拿到逐行輸出（建置進度、UART 串流）。

`fwai-bridge` 走**動態 `import()`** 而不是靜態 import，是因為 VS Code 擴充是
CJS 而 fwai 是 ESM —— 靜態 import 接不起來，動態 import 是跨越這個落差的橋。

分流原則：**會改變狀態的走 CLI**（拿得到離開碼與串流），
**只是讀取的走 lib**（省下行程啟動成本）。

### WebView

兩種型態不能混談：

```
Extension Host (Node.js)
├── ChatPanelProvider  — WebviewViewProvider（常駐面板區的檢視）
│   ├── resolveWebviewView(view, ...)
│   ├── postMessage({type: "user-input", text}) → webview
│   └── onDidReceiveMessage ← webview
│         └── 經 fwai-bridge 跑 agentic loop，串流回傳
│
├── EvidenceDetail — createWebviewPanel（獨立分頁）
│   └── loadEvidence(runId) → 產生 HTML
└── MemoryPanel    — createWebviewPanel（獨立分頁）
    └── computeMemoryReport(elf) → flash/RAM 長條圖
```

### 其他貢獻點

| 項目 | 檔案 | 說明 |
|------|------|------|
| 樹狀檢視 | `views/*-tree.ts` | Evidence / Skills / Agents / Tools 四個 |
| 狀態列 | `statusbar/status-bar.ts` | 專案+MCU、目前模型（未設定顯示 No LLM） |
| 診斷 | `providers/diagnostics.ts` | 解析 GCC 格式建置錯誤 → 問題面板 |
| 任務 | `providers/tasks.ts` | 每個 skill 自動成為 type `fwai` 的任務 |

**【未接線】** `package.json` 宣告了 `fwai.pluginsView` 但 `extension.ts`
沒有為它註冊 provider，該檢視會出現在側邊欄且永遠是空的。
另有 7 個指令（marketplace / license / audit / ota / debug / security / policy）
只顯示選單並往 OutputChannel 寫一行，尚未接上 CLI。

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

**注意**：等待確認時，`line` 事件必須把該行**直接**餵給 `confirmResolver`，
不能推進佇列 —— `drainQueue` 此時正卡在 await 尚未完成的 handler，
排進佇列的答案永遠不會被取出，形成 deadlock。

### 7. 無外部向量資料庫

**決策**：KB 嵌入向量存為扁平 JSON (`.fwai/kb/.embeddings.json`)

**理由**：保持自包含，無需外部服務，適合嵌入式開發環境

**【未實作】** 目前 `core/kb-loader.ts` 只做關鍵字比對，沒有嵌入向量或語意搜尋。

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
| `commander` | ^13.1.0 | CLI 框架 |
| `zod` | ^3.24.0 | Schema 驗證 |
| `yaml` | ^2.7.0 | YAML 解析 |
| `ora` | ^8.2.0 | CLI spinner |
| `minimatch` | ^10.2.3 | Glob 模式匹配 |

### 開發依賴

| 套件 | 用途 |
|------|------|
| `typescript` ^5.7.0 | TypeScript 編譯器 |
| `tsx` ^4.19.0 | 直接執行 TS；測試也透過它跑 |
| `eslint` ^9.0.0 | Lint（搭配 `@typescript-eslint/*` ^8.0.0） |
| `prettier` ^3.4.0 | 格式化（`eslint-config-prettier` ^10.0.0） |
| `@types/node` ^22.13.0 | Node.js 型別定義 |

測試框架是 **Node.js 內建的 `node:test`**，透過 `tsx --test` 執行
（`npm test`）—— 沒有使用 jest。CI 也呼叫同一個 npm script，
避免 CI 與本機的測試範圍出現落差。

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
| Phase 6 | 真實 MCP 整合（stdio JSON-RPC 已可用）、對話持久化（`session-store`）、pre/post hook、上下文壓縮 | 完成 |
| Phase 7 | 安全與健壯性加固：shell 跳脫、路徑穿越防護、程序終止升級、簽章信任存放區、CI 修復 | 完成 |
| Phase 8 | 多 Provider 對等（Gemini / Ollama）、語意 KB/RAG、Board Farm 實作、`/mcp` 與 `/kb` 介面 | 計畫中 |
| Phase 9 | OpenTelemetry 可觀測性 | 計畫中 |

### 目前規模

| 項目 | 數量 |
|------|------|
| `src/` 模組 | 100 |
| 原始碼行數 | ~11.3k |
| 測試檔 / 測試數 | 30 / 244 |
| REPL 指令 | 21 |
| 內建 agentic 工具 | 8 |
