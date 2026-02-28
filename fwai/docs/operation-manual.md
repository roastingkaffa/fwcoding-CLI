# fwai 操作手冊 (Operation Manual)

> 版本 0.1.0 | 最後更新：2026-02-28

---

## 目錄

1. [系統需求與安裝](#1-系統需求與安裝)
2. [專案初始化](#2-專案初始化)
3. [組態設定](#3-組態設定)
4. [日常操作流程](#4-日常操作流程)
5. [互動式 REPL](#5-互動式-repl)
6. [自然語言與 AI 助手](#6-自然語言與-ai-助手)
7. [Agent 模式](#7-agent-模式)
8. [Skill 工作流程](#8-skill-工作流程)
9. [CI/CD 整合](#9-cicd-整合)
10. [安全性與合規](#10-安全性與合規)
11. [插件市集](#11-插件市集)
12. [OTA 更新](#12-ota-更新)
13. [除錯 (GDB/OpenOCD)](#13-除錯-gdbopenocd)
14. [Knowledge Base](#14-knowledge-base)
15. [Board Farm](#15-board-farm)
16. [MCP 伺服器](#16-mcp-伺服器)
17. [VS Code 擴充功能](#17-vs-code-擴充功能)
18. [故障排除](#18-故障排除)

---

## 1. 系統需求與安裝

### 最低需求

| 項目 | 需求 |
|------|------|
| Node.js | >= 20.0.0 |
| OS | Linux / macOS / WSL2 |
| Git | 已安裝並初始化倉庫 |

### 建議安裝的韌體工具鏈

- `arm-none-eabi-gcc` — ARM 交叉編譯器
- `arm-none-eabi-gdb` — ARM 除錯器
- `openocd` — 開源晶片除錯器
- `cmake` / `make` — 建置系統

### 安裝 fwai

```bash
# 從專案目錄
cd fwai/
npm install
npm run build

# 全域連結（開發）
npm link
```

### 驗證安裝

```bash
fwai doctor
```

此命令會檢查：
- Git 可用性
- Node.js 版本
- 工具鏈（編譯器、除錯器、燒錄器）
- 序列埠可存取性
- LLM API Key 設定

---

## 2. 專案初始化

### 建立 `.fwai/` 工作區

```bash
cd your-firmware-project/
fwai init
```

此命令會建立以下結構：

```
.fwai/
├── config.yaml       # 全域設定（LLM、安全策略、模式）
├── project.yaml      # 專案描述（MCU、建置、序列埠）
├── tools/            # 工具定義（build/flash/monitor 等）
│   ├── build.tool.yaml
│   ├── flash.tool.yaml
│   └── monitor.tool.yaml
├── skills/           # 工作流程組合（multi-step skills）
├── agents/           # AI 代理設定
├── runs/             # 執行紀錄與 evidence
├── logs/             # 日誌
├── kb/               # Knowledge Base 文件
├── keys/             # 簽章金鑰（ed25519）
├── plugins/          # 已安裝的市集插件
└── ota/              # OTA 套件
```

### 編輯專案設定

**`.fwai/project.yaml`** — 設定目標硬體：

```yaml
project:
  name: my-stm32-project
  description: STM32 嵌入式系統
  target:
    mcu: STM32F401CCU6
    arch: armv7
    board: NUCLEO-F401RE
    flash_size: 256K
    ram_size: 64K
  build:
    system: cmake
    build_dir: build
    source_dir: src
  serial:
    port: /dev/ttyUSB0
    baud: 115200
  boot:
    success_patterns:
      - "System Ready"
      - "Init Complete"
    failure_patterns:
      - "PANIC"
      - "Hard Fault"
  toolchain:
    compiler: arm-none-eabi-gcc
    debugger: arm-none-eabi-gdb
    flasher: openocd
    openocd_config: openocd.cfg
```

---

## 3. 組態設定

### LLM Provider 設定

**`.fwai/config.yaml`**：

```yaml
provider:
  name: anthropic          # anthropic | openai | gemini | local
  model: claude-sonnet-4-20250514
  api_key_env: ANTHROPIC_API_KEY
  max_tokens: 4096
  temperature: 0.2
```

設定環境變數：

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."          # 若使用 OpenAI
export GOOGLE_API_KEY="..."             # 若使用 Gemini
```

### 安全策略設定

```yaml
policy:
  protected_paths:
    - "bootloader/**"
    - ".fwai/**"
    - "*.key"
  change_budget:
    max_files_changed: 5
    max_lines_changed: 200
  flash_guard:
    require_confirmation: true
    require_build_success: true
  require_evidence: true
  compliance_mode: none          # none | iso26262 | do178c | iec62443
  require_signing: false
  require_sbom: false
  allowed_tools: []              # 空 = 全部允許
  blocked_tools: []
```

### 安全性設定

```yaml
security:
  secret_patterns:
    - "password\\s*=\\s*['\"].*['\"]"
    - "api[_-]?key\\s*[:=]"
    - "-----BEGIN.*PRIVATE KEY-----"
  redact_in_evidence: true
  redact_in_logs: true
  signing:
    enabled: false
    key_path: .fwai/keys/evidence.key
    algorithm: ed25519
```

### 日誌設定

```yaml
logging:
  level: info          # debug | info | warn | error
  color: true
mode:
  default: interactive  # interactive | ci
  ci:
    max_total_duration_sec: 600
```

---

## 4. 日常操作流程

### 典型的 Build → Flash → Monitor 流程

```
$ fwai
fwai> /build
  ℹ Running build...
  ✓ Build succeeded (2.3s)
  ✓ Evidence saved: 20260228-161234-build

fwai> /flash
  Flash firmware to STM32F401CCU6 on /dev/ttyUSB0? (y/N) y
  ✓ Flash complete (4.1s)

fwai> /monitor
  ℹ Monitoring UART...
  ✓ Boot pattern matched: "System Ready" (1.2s)
  ✓ Evidence saved: 20260228-161301-monitor
```

### 查看執行紀錄

```
fwai> /evidence
  Recent runs:
  #1  20260228-161234-build    success  2.3s
  #2  20260228-161245-flash    success  4.1s
  #3  20260228-161301-monitor  success  1.2s

fwai> /evidence #1
  Run: 20260228-161234-build
  Status: success
  Duration: 2.3s
  Tools: build (success)
  Changes: 3 files, +42/-18 lines
```

### 記憶體分析

```
fwai> /memory
  ℹ Looking in build/...
  Memory Usage:
  ┌─────────┬───────────┬───────────┬────────┐
  │ Region  │ Used      │ Total     │ %      │
  ├─────────┼───────────┼───────────┼────────┤
  │ Flash   │ 45,312 B  │ 262,144 B │ 17.3%  │
  │ RAM     │ 12,480 B  │ 65,536 B  │ 19.0%  │
  └─────────┴───────────┴───────────┴────────┘
```

---

## 5. 互動式 REPL

啟動互動模式：

```bash
fwai          # 無子命令 → 進入 REPL
```

### 指令格式

- **`/command [args]`** — 執行 REPL 指令
- **自然語言** — 觸發 AI 助手或 Skill 匹配

### 輸入處理流程

```
使用者輸入
    ├── 以 "/" 開頭 → 路由至指令處理器
    └── 自然語言
         ├── Tier 1: 精確匹配 Skill 名稱 (confidence = 1.0)
         ├── Tier 2: 關鍵字匹配 Skill triggers (confidence = 1.0)
         ├── Tier 3: LLM 意圖分類 (confidence = 0~1)
         │     ├── > 0.8 → 自動執行 Skill
         │     ├── > 0.6 → 詢問使用者確認
         │     └── < 0.6 → 進入自由對話
         └── 自由對話 (Agentic Loop 或 Text-only)
```

### 退出

```
fwai> /exit
# 或
fwai> /quit
# 或 Ctrl+C
```

---

## 6. 自然語言與 AI 助手

### Agentic Loop（工具呼叫模式）

當 LLM Provider 支持 tool-calling（如 Anthropic）時，AI 助手可以自主使用工具：

```
fwai> 幫我分析 src/drivers/uart.c 的初始化流程

  Tool: read_file(file_path: src/drivers/uart.c)
  ✓ Tool read_file done (12 chars)

  Tool: grep(pattern: "UART_Init", path: src/)
  ✓ Tool grep done (234 chars)

  根據程式碼分析，UART 初始化流程如下：
  1. 啟用 GPIO 時鐘 (RCC_AHB1ENR)
  2. 設定 TX/RX pin 為 alternate function
  3. 配置波特率、word length、stop bits
  ...
```

### 內建 AI 工具

| 工具 | 功能 |
|------|------|
| `read_file` | 讀取檔案（支援 offset/limit） |
| `write_file` | 寫入/建立檔案（受 protected_paths 約束） |
| `edit_file` | 精確文字替換（old_text → new_text） |
| `grep` | 正規表達式搜尋（使用 ripgrep） |
| `glob` | 檔案名稱模式搜尋 |
| `bash` | 執行 Shell 命令（預設 120s 逾時） |
| `gdb` | GDB 除錯命令 |

### Agentic Loop 限制

- **最大迭代次數**：50（可在 agent config 中調整）
- **受保護路徑**：AI 無法寫入 `policy.protected_paths` 中的路徑
- **變更預算**：受 `change_budget` 約束
- **串流輸出**：文字即時串流顯示

---

## 7. Agent 模式

### 啟動 Agent 對話

```
fwai> /agent bsp
  [bsp Agent]
  Available tools: bash, read_file, grep, glob
  Allowed paths: src/bsp/**

bsp> 幫我新增 SPI 驅動初始化
  Tool: read_file(file_path: src/bsp/spi.h)
  ...
bsp> exit
```

### 定義自訂 Agent

**`.fwai/agents/bsp.agent.yaml`**：

```yaml
name: bsp
description: Board Support Package 專家
model: inherit                    # 使用全域 provider 的 model
system_prompt: |
  你是韌體 BSP (Board Support Package) 專家。
  協助使用者處理硬體抽象層、GPIO、UART、SPI 等設定。
  回答必須技術性且精確。
allowed_paths:
  - "src/bsp/**"
  - "include/bsp/**"
protected_paths:
  - "src/bsp/bootloader*"
tools:
  - read_file
  - write_file
  - edit_file
  - grep
  - glob
  - bash
max_iterations: 30
temperature: 0.1
```

### Agent 安全範圍

- `allowed_paths` — Agent 只能存取這些路徑
- `protected_paths` — 額外的禁寫路徑（疊加全域 policy）
- `tools` — 限制可用工具清單（空 = 使用全部預設工具）

---

## 8. Skill 工作流程

### 定義 Skill

**`.fwai/skills/build_and_test.skill.yaml`**：

```yaml
name: build_and_test
description: 建置韌體並執行測試
triggers:
  - "build and test"
  - "compile and verify"
steps:
  - tool: build
    on_fail: abort              # abort | continue | retry

  - tool: test
    on_fail: continue

  - action: evidence
    summary: true

  - action: llm_analyze
    input: "build.log"
    prompt: "分析建置結果，指出任何警告或潛在問題"
```

### Step 類型

| 類型 | 說明 |
|------|------|
| `tool` | 執行 `.fwai/tools/` 中定義的工具 |
| `evidence` | 記錄執行結果至 evidence.json |
| `llm_analyze` | 使用 LLM 分析指定輸入 |
| `agentic` | 啟動 Agentic Loop 完成指定目標 |

### 手動執行 Skill

```
fwai> /skills                     # 列出所有 Skill
fwai> build and test              # 自然語言觸發
# 或在 CI 中
fwai run build_and_test --ci --json
```

---

## 9. CI/CD 整合

### 基本用法

```bash
# 非互動執行 Skill
fwai run build_and_test --ci --yes --json

# 指定 Skill + 自動確認 + JSON 輸出
fwai run flash --ci --yes --json --quiet
```

### CLI 旗標

| 旗標 | 說明 |
|------|------|
| `--ci` | CI 模式（禁用互動、嚴格策略、watchdog 計時器） |
| `--yes` | 自動確認所有提示 |
| `--json` | stdout 輸出 JSON 摘要 |
| `--quiet` | 靜默模式（僅 stderr 輸出錯誤） |

### Exit Codes

| Code | 意義 |
|------|------|
| 0 | 成功 |
| 1 | 通用錯誤 |
| 2 | 工具步驟失敗 |
| 3 | Flash guard 拒絕（未確認或建置未通過） |
| 4 | 變更預算超標 |
| 5 | Skill 未找到 |
| 7 | CI 逾時（watchdog） |

### GitHub Actions 範例

```yaml
jobs:
  firmware-ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install fwai
        run: npm install -g fwai

      - name: Build & Test
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          fwai run build_and_test --ci --yes --json > result.json
          cat result.json

      - name: Audit Export
        run: fwai audit export --format sarif --output audit.sarif
```

---

## 10. 安全性與合規

### 金鑰管理

```
fwai> /security keygen
  ✓ Generated ed25519 key pair:
    Private: .fwai/keys/evidence.key
    Public:  .fwai/keys/evidence.pub
```

### Evidence 簽章

啟用 `config.yaml`：

```yaml
security:
  signing:
    enabled: true
    key_path: .fwai/keys/evidence.key
```

驗證簽章：

```
fwai> /security verify 20260228-161234-build
  ✓ Signature valid
```

### 秘密掃描

```
fwai> /security scan
  Scanning source files...
  ⚠ Found 2 potential secrets:
    src/config.h:14 — matches "api_key"
    src/wifi.c:42 — matches "password ="
```

### 稽核匯出

```
fwai> /audit summary
  Total runs: 47
  Passed: 42, Failed: 3, Partial: 2
  Chain hash: 8a3f...c21d (valid)

fwai> /audit export --format sarif --output report.sarif
fwai> /audit export --format html --since 2026-02-01 --output report.html
fwai> /audit verify
  ✓ Chain hash valid for all 47 runs
```

### 組織策略

```yaml
# config.yaml
org_policy:
  path: .fwai/org-policy.yaml    # 或 URL
  enforce: true
  refresh_interval_sec: 3600
```

```
fwai> /policy show      # 顯示合併後的策略
fwai> /policy validate  # 驗證是否符合組織要求
fwai> /policy refresh   # 重新載入組織策略
fwai> /policy diff      # 顯示組織策略覆蓋項
```

---

## 11. 插件市集

### 搜尋與安裝

```
fwai> /marketplace search stm32
  Found 3 packages:
    stm32-bsp-tools  v1.2.0  STM32 BSP 工具集
    stm32-rtos       v0.5.0  FreeRTOS 整合
    stm32-hal        v2.0.1  HAL 驅動程式碼生成

fwai> /marketplace install stm32-bsp-tools
  ✓ Installed stm32-bsp-tools v1.2.0

fwai> /marketplace info stm32-bsp-tools
  Name: stm32-bsp-tools
  Version: 1.2.0
  Author: fwai-community
  Artifacts:
    Tools: stm32-clock-config, stm32-pinout
    Skills: stm32-init
    Agents: stm32-expert
```

### 插件目錄結構

```
.fwai/plugins/stm32-bsp-tools/
├── manifest.json
├── tools/
│   ├── stm32-clock-config.tool.yaml
│   └── stm32-pinout.tool.yaml
├── skills/
│   └── stm32-init.skill.yaml
└── agents/
    └── stm32-expert.agent.yaml
```

---

## 12. OTA 更新

### 建立 OTA 套件

```
fwai> /ota bundle --version 1.2.0 --elf build/firmware.elf
  ✓ OTA bundle created: v1.2.0
    Binary: .fwai/ota/v1.2.0/firmware.bin
    Checksum: sha256:a1b2c3...
```

### 部署

```
fwai> /ota deploy --target device-01
  Deploy v1.2.0 to device-01? (y/N) y
  ✓ Deployed to device-01 (12.3s, boot verified)

fwai> /ota deploy --all
  Deploy v1.2.0 to all 3 devices? (y/N) y
  ✓ device-01: success (12.3s)
  ✓ device-02: success (13.1s)
  ✗ device-03: fail (timeout)
```

### 回滾

```
fwai> /ota rollback device-03 1.1.0
  ✓ Rolled back device-03 to v1.1.0
```

---

## 13. 除錯 (GDB/OpenOCD)

### GDB 批次命令

```
fwai> /debug run build/firmware.elf info registers backtrace
  Registers:
    r0=0x00000000  r1=0x20001234  r2=0x08004567  ...
    sp=0x20008000  lr=0x08001234  pc=0x08003456

  Backtrace:
    #0  main () at src/main.c:42
    #1  Reset_Handler () at startup.s:12
```

### 快捷命令

```
fwai> /debug registers build/firmware.elf
fwai> /debug backtrace build/firmware.elf
```

### 啟動 OpenOCD

```
fwai> /debug openocd
  ✓ OpenOCD started
    GDB port: 3333
    Telnet port: 4444
```

---

## 14. Knowledge Base

### 新增 KB 文件

將 `.md` 或 `.txt` 文件放入 `.fwai/kb/` 目錄：

```
.fwai/kb/
├── stm32-errata.md
├── uart-troubleshooting.md
└── memory-map.txt
```

### KB 搜尋

KB 內容會自動注入 AI 助手的 system prompt：

```
fwai> UART 收不到資料怎麼辦？
  [AI 自動搜尋 KB，找到 uart-troubleshooting.md]
  根據 Knowledge Base 的說明：
  1. 確認波特率設定...
  2. 檢查 RX pin 的 alternate function...
```

### KB 設定

```yaml
# config.yaml
kb:
  enabled: true
  max_context_tokens: 4000
  include: ["**/*.md", "**/*.txt"]
  exclude: ["drafts/**"]
  embedding_model: text-embedding-3-small    # 語意搜尋（optional）
  embedding_provider: openai                  # openai | ollama
  semantic_weight: 0.5                        # 0=純關鍵字, 1=純語意
```

---

## 15. Board Farm

### 設定

```yaml
# config.yaml
board_farm:
  enabled: true
  url: https://farm.example.com
  api_key_env: BOARD_FARM_API_KEY
  default_timeout_sec: 300
```

### 操作

```
fwai> /farm list
  Available Boards:
    board-001       STM32F401     available
    board-002       ESP32-S3      allocated
    board-003       nRF52840      available

fwai> /farm allocate board-001
  ✓ Allocated board board-001

fwai> /farm release board-001
  ✓ Released board board-001
```

---

## 16. MCP 伺服器

### 設定

```yaml
# config.yaml
mcp:
  servers:
    - name: filesystem
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
      timeout_sec: 30
    - name: database
      command: npx
      args: ["-y", "@modelcontextprotocol/server-sqlite", "data.db"]
      env:
        NODE_ENV: production
```

### 管理命令

```
fwai> /mcp list           # 列出設定的 MCP 伺服器
fwai> /mcp status         # 顯示連線狀態與工具數量
fwai> /mcp tools          # 列出所有 MCP 工具
fwai> /mcp restart <name> # 重新啟動指定伺服器
```

MCP 工具會自動註冊到 ToolRegistry，AI 助手可以直接使用。

---

## 17. VS Code 擴充功能

### 安裝

在 VS Code 中安裝 `vscode-fwai` 擴充功能。

### 可用命令

| 命令 | 說明 |
|------|------|
| `fwai: Initialize Workspace` | 初始化 .fwai/ |
| `fwai: Open REPL` | 開啟互動式終端 |
| `fwai: Build Project` | 執行建置 |
| `fwai: Flash Device` | 燒錄韌體 |
| `fwai: Monitor Serial` | 監聽序列埠 |
| `fwai: Run Skill` | 執行 Skill |
| `fwai: Agent Chat` | 開啟 Agent 對話 |
| `fwai: Show Evidence` | 查看執行紀錄 |
| `fwai: Memory Analysis` | 記憶體分析 |
| `fwai: Doctor` | 環境健康檢查 |

### 側邊欄面板

- **Agents** — 瀏覽設定的 AI Agent
- **Skills** — 瀏覽可用的 Skill
- **Tools** — 瀏覽工具定義
- **Evidence** — 瀏覽執行紀錄

### WebView 面板

- **Chat Panel** — AI 對話介面
- **Evidence Detail** — 執行紀錄詳情
- **Memory Panel** — 記憶體使用量視覺化

---

## 18. 故障排除

### LLM 無法使用

```
fwai> /doctor
  ✗ API key not set: ANTHROPIC_API_KEY
```

**解決**：設定環境變數 `export ANTHROPIC_API_KEY="sk-ant-..."`

### 建置失敗

```
fwai> /build
  ✗ Build failed
```

**解決**：
1. 檢查 `.fwai/tools/build.tool.yaml` 中的 `command` 是否正確
2. 確認建置系統已安裝（cmake、make 等）
3. 檢查 `build.log`（在 `.fwai/runs/<run-id>/` 中）

### Flash guard 拒絕

```
  ✗ Flash guard: no successful build found
```

**解決**：先執行 `/build`，確認建置成功後再 `/flash`

### 變更預算超標

```
  ✗ Change budget exceeded: 8 files (max: 5)
```

**解決**：
- 調整 `policy.change_budget.max_files_changed`
- 或分批提交變更

### 工具鏈未找到

```
  ✗ arm-none-eabi-gcc not found
```

**解決**：安裝 ARM GNU Toolchain 並確認在 PATH 中

### MCP 連線失敗

**解決**：
1. 確認 MCP server 命令可執行
2. 檢查 `timeout_sec` 是否足夠
3. 使用 `/mcp status` 檢視連線狀態

### Provider 切換

```
fwai> /provider openai gpt-4o
  ✓ Switched to openai (gpt-4o)
```

即時切換不需要重啟 REPL。
