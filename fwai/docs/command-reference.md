# fwai 指令手冊 (Command Reference)

> 版本 0.1.0 | 最後更新：2026-02-28

---

## 目錄

1. [CLI 命令](#1-cli-命令)
2. [REPL 指令總覽](#2-repl-指令總覽)
3. [建置與燒錄](#3-建置與燒錄)
4. [監控與除錯](#4-監控與除錯)
5. [AI 互動](#5-ai-互動)
6. [設定與環境](#6-設定與環境)
7. [Evidence 與稽核](#7-evidence-與稽核)
8. [安全性](#8-安全性)
9. [插件與授權](#9-插件與授權)
10. [OTA 更新](#10-ota-更新)
11. [基礎設施](#11-基礎設施)

---

## 1. CLI 命令

### `fwai`

啟動互動式 REPL（預設行為，無子命令時）。

```bash
fwai
```

### `fwai init`

初始化 `.fwai/` 工作區。

```bash
fwai init
```

建立完整的工作區結構，包含模板設定檔。

### `fwai doctor`

檢查環境健康狀態。

```bash
fwai doctor
```

檢查項目：git、Node.js、工具鏈（compiler/debugger/flasher）、序列埠、LLM API key。

### `fwai run <skill>`

非互動式執行 Skill（CI 適用）。

```bash
fwai run <skill-name> [options]
```

| 選項 | 說明 |
|------|------|
| `--ci` | CI 模式：禁用互動、啟用 watchdog timer |
| `--yes` | 自動確認所有提示（flash 確認等） |
| `--json` | 結束時輸出 JSON 摘要到 stdout |
| `--quiet` | 靜默模式（僅 stderr 錯誤） |

**Exit Codes：**

| Code | 意義 |
|------|------|
| `0` | 成功 |
| `1` | 通用錯誤 |
| `2` | 工具步驟失敗（`tool_failure`） |
| `3` | Flash guard 拒絕（`ci_guard_rejected`） |
| `4` | 變更預算超標（`budget_exceeded`） |
| `5` | Skill 未找到（`skill_not_found`） |
| `7` | CI 逾時（`timeout`） |

**範例：**

```bash
# 執行 build_and_test skill，CI 模式
fwai run build_and_test --ci --yes --json

# 靜默執行，僅看 JSON 結果
fwai run flash --ci --yes --json --quiet > result.json
```

### `fwai ota <subcommand>`

OTA 更新管理（可在 REPL 外使用）。

```bash
fwai ota bundle --version 1.0.0 --elf build/firmware.elf
fwai ota deploy --target device-01
fwai ota list
```

### `fwai audit <subcommand>`

稽核匯出（可在 REPL 外使用）。

```bash
fwai audit summary
fwai audit export --format sarif --output report.sarif
fwai audit verify
```

---

## 2. REPL 指令總覽

在互動式 REPL 中，所有指令以 `/` 開頭。

| 指令 | 說明 | 類別 |
|------|------|------|
| `/help` | 列出所有可用指令 | 系統 |
| `/build` | 執行建置工具 | 建置/燒錄 |
| `/flash` | 燒錄韌體至目標板 | 建置/燒錄 |
| `/monitor` | 擷取 UART 輸出 | 監控 |
| `/memory` | 分析韌體記憶體使用量 | 監控 |
| `/debug` | GDB/OpenOCD 除錯 | 除錯 |
| `/agent` | 啟動範圍限定 Agent 對話 | AI |
| `/agents` | 列出已設定的 Agent | AI |
| `/skills` | 列出可用的 Skill | AI |
| `/provider` | 顯示/切換 LLM Provider | AI |
| `/config` | 顯示目前設定 | 設定 |
| `/doctor` | 環境健康檢查 | 設定 |
| `/evidence` | 列出/查看執行紀錄 | 稽核 |
| `/audit` | 稽核匯出/驗證/摘要 | 稽核 |
| `/security` | 金鑰/簽章/掃描 | 安全 |
| `/policy` | 組織策略管理 | 安全 |
| `/license` | 授權管理 | 商業 |
| `/marketplace` | 插件市集 | 商業 |
| `/ota` | OTA 更新管理 | 部署 |
| `/farm` | Board Farm 管理 | 基礎設施 |
| `/mcp` | MCP 伺服器管理 | 基礎設施 |
| `/kb` | Knowledge Base 管理 | 基礎設施 |
| `/exit` | 退出 REPL | 系統 |
| `/quit` | 退出 REPL（同 /exit） | 系統 |

---

## 3. 建置與燒錄

### `/build`

執行建置工具，收集 build.log。

```
/build
```

**行為：**
1. 檢查 `.fwai/tools/build.tool.yaml` 中的建置定義
2. 檢查變更預算（`policy.change_budget`）
3. 執行建置命令（如 `cmake --build build`）
4. 匹配 `success_patterns` / `failure_patterns`
5. 收集建置產出（artifacts）
6. 建立 Evidence 紀錄

**CI 模式特殊行為：**
- 變更預算超標 → exit code 4

---

### `/flash`

燒錄韌體至目標裝置。

```
/flash
```

**行為：**
1. **Flash Guard 檢查**：
   - 如果 `policy.flash_guard.require_build_success = true`：確認最近一次建置成功
   - 如果 `policy.flash_guard.require_confirmation = true`：要求使用者確認
2. 執行燒錄命令（如 `openocd -f openocd.cfg -c "program build/firmware.elf verify reset exit"`）
3. 建立 Evidence 紀錄

**CI 模式特殊行為：**
- 需要 `--yes` 旗標才能自動確認
- 未提供 `--yes` → exit code 3

---

## 4. 監控與除錯

### `/monitor [duration]`

擷取 UART 序列埠輸出。

```
/monitor               # 使用預設逾時
/monitor 30            # 監聽 30 秒
```

**參數：**

| 參數 | 說明 | 預設 |
|------|------|------|
| `duration` | 監聽持續時間（秒） | 來自 tool 定義的 `timeout_sec` |

**行為：**
1. 開啟序列埠（`project.serial.port`，波特率 `project.serial.baud`）
2. 擷取輸出至 `uart.log`
3. 匹配 `boot.success_patterns` / `boot.failure_patterns`
4. 回報 boot 狀態（success/fail/unknown）
5. 建立 Evidence 紀錄

---

### `/memory [elf_path]`

分析韌體記憶體使用量。

```
/memory                           # 自動偵測 build/ 中的 .elf
/memory build/firmware.elf        # 指定 ELF 檔案
```

**參數：**

| 參數 | 說明 | 預設 |
|------|------|------|
| `elf_path` | ELF 檔案路徑 | 自動從 `build_dir` 偵測 |

**需求：** `arm-none-eabi-size` 需在 PATH 中。

**輸出範例：**

```
Memory Usage:
┌─────────┬───────────┬───────────┬────────┐
│ Region  │ Used      │ Total     │ %      │
├─────────┼───────────┼───────────┼────────┤
│ Flash   │ 45,312 B  │ 262,144 B │ 17.3%  │
│ RAM     │ 12,480 B  │ 65,536 B  │ 19.0%  │
└─────────┴───────────┴───────────┴────────┘
```

---

### `/debug <subcommand>`

GDB 除錯與 OpenOCD 管理。

#### `/debug run <elf> [commands...]`

執行 GDB 批次命令。

```
/debug run build/firmware.elf info registers backtrace info threads
```

| 參數 | 說明 |
|------|------|
| `elf` | ELF 檔案路徑（必填） |
| `commands...` | GDB 命令序列（選填） |

**預設命令**：`info registers`、`backtrace`、`info threads`

---

#### `/debug registers <elf>`

顯示暫存器狀態（等同 `/debug run <elf> info registers`）。

```
/debug registers build/firmware.elf
```

**輸出範例：**

```
Registers:
  r0  = 0x00000000    r1  = 0x20001234
  r2  = 0x08004567    r3  = 0x00000001
  sp  = 0x20008000    lr  = 0x08001234
  pc  = 0x08003456    xpsr = 0x61000000
```

---

#### `/debug backtrace <elf>`

顯示呼叫堆疊（等同 `/debug run <elf> backtrace`）。

```
/debug backtrace build/firmware.elf
```

**輸出範例：**

```
Backtrace:
  #0  HAL_UART_Transmit () at src/drivers/uart.c:142
  #1  printf_redirect () at src/utils/io.c:28
  #2  main () at src/main.c:67
  #3  Reset_Handler () at startup/startup_stm32f401.s:12
```

---

#### `/debug openocd`

啟動 OpenOCD 伺服器。

```
/debug openocd
```

使用 `project.toolchain.openocd_config` 中指定的設定檔。

**輸出：**

```
✓ OpenOCD started
  GDB port:    3333
  Telnet port: 4444
```

---

## 5. AI 互動

### `/agent <name>`

啟動範圍限定的 Agent 對話。

```
/agent bsp
/agent driver
/agent test
```

| 參數 | 說明 |
|------|------|
| `name` | Agent 名稱（需在 `.fwai/agents/` 中定義） |

**行為：**
1. 載入 Agent 設定（system_prompt、tools、allowed_paths）
2. 建立範圍限定的 ToolRegistry
3. 進入 Agent 對話模式
4. 顯示可用工具和允許路徑
5. 使用 Agentic Loop 處理每次輸入

**退出：** 輸入 `exit`

**範例：**

```
fwai> /agent bsp
[bsp Agent]
Available tools: bash, read_file, grep, glob, write_file, edit_file
Allowed paths: src/bsp/**

bsp> 幫我檢查 GPIO 初始化的時鐘設定
  Tool: grep(pattern: "RCC.*Enable", path: src/bsp/)
  ...
bsp> exit
fwai>
```

---

### `/agents`

列出所有已設定的 Agent。

```
/agents
```

**輸出範例：**

```
Configured Agents:
  bsp       [inherit]  Board Support Package specialist
  driver    [inherit]  Device driver expert
  test      [inherit]  Test & validation agent
```

---

### `/skills`

列出所有可用的 Skill。

```
/skills
```

**輸出範例：**

```
Available Skills:
  build_and_test    3 steps  Build and run tests
  flash_verify      4 steps  Flash and verify boot
  full_pipeline     6 steps  Complete CI pipeline
```

---

### `/provider [name] [model]`

顯示或切換 LLM Provider。

```
/provider                          # 顯示目前狀態
/provider openai gpt-4o           # 切換到 OpenAI GPT-4o
/provider anthropic claude-sonnet-4-20250514
/provider gemini gemini-2.0-flash
/provider local llama3.2
```

**無參數** — 顯示目前 Provider 狀態：

```
LLM Provider Status
  ✓ Provider: anthropic
    Model: claude-sonnet-4-20250514
    Tool-calling: yes

Usage: /provider <name> [model]
  Names: anthropic, openai, gemini, local
```

**參數：**

| 參數 | 說明 | 預設 |
|------|------|------|
| `name` | Provider 名稱 | — |
| `model` | 模型 ID | Provider 預設值 |

**Provider 預設模型：**

| Provider | 預設模型 |
|----------|----------|
| `anthropic` | `claude-sonnet-4-20250514` |
| `openai` | `gpt-4o` |
| `gemini` | `gemini-pro` |
| `local` | `local` |

**即時切換**：不需要重啟 REPL，切換後立即生效。

---

### 自然語言輸入

在 REPL 中直接輸入自然語言，系統會：

1. 嘗試匹配已定義的 Skill（精確 → 關鍵字 → LLM 分類）
2. 高信心度（≥ 0.8）→ 自動執行 Skill
3. 中信心度（≥ 0.6）→ 詢問使用者確認
4. 低信心度 → 進入 AI 自由對話（Agentic Loop）

**範例：**

```
fwai> build and test firmware
  Matched skill: build_and_test (confidence: 1.00, source: keyword)
  [執行 Skill 步驟...]

fwai> 幫我分析 UART 驅動程式的問題
  [進入 Agentic Loop，AI 自主使用工具分析]

fwai> 什麼是 DMA transfer?
  [AI 回答問題，不使用工具]
```

---

## 6. 設定與環境

### `/config`

顯示目前設定。

```
/config
```

**輸出範例：**

```
Configuration:
  Provider: anthropic (claude-sonnet-4-20250514)
    API key env: ANTHROPIC_API_KEY
  Project: my-stm32-project
    MCU: STM32F401CCU6
    Board: NUCLEO-F401RE
    Serial: /dev/ttyUSB0 @ 115200
  Mode: interactive
  Log level: info
```

---

### `/doctor`

執行環境健康檢查。

```
/doctor
```

**檢查項目：**

| 項目 | 說明 |
|------|------|
| Git | git 是否已安裝 |
| Node.js | 版本是否 ≥ 20 |
| project.yaml | 是否存在且有效 |
| config.yaml | 是否存在且有效 |
| Compiler | `arm-none-eabi-gcc --version` |
| Debugger | `arm-none-eabi-gdb --version` |
| Flasher | `openocd --version` |
| Serial port | 序列埠是否可存取 |
| API key | 環境變數是否已設定 |

**輸出範例：**

```
Environment Health Check:
  ✓ Git: 2.43.0
  ✓ Node.js: v20.11.0
  ✓ project.yaml: valid
  ✓ config.yaml: valid
  ✓ arm-none-eabi-gcc: 13.2.1
  ✓ arm-none-eabi-gdb: 13.2.1
  ✗ openocd: not found
  ⚠ Serial port /dev/ttyUSB0: not connected
  ✓ ANTHROPIC_API_KEY: set

Status: READY (1 warning, 1 error)
```

---

### `/help`

列出所有可用指令。

```
/help
```

---

## 7. Evidence 與稽核

### `/evidence [run-id|#index]`

列出或查看執行紀錄。

```
/evidence                  # 列出最近 5 筆
/evidence #1               # 查看第 1 筆（最新的）
/evidence 20260228-161234  # 以 run_id 前綴搜尋
```

**無參數** — 列出最近紀錄：

```
Recent runs:
  #1  20260228-161234-build    success  2.3s
  #2  20260228-161156-flash    success  4.1s
  #3  20260228-161120-monitor  success  1.2s
```

**指定 run** — 顯示詳情：

```
Run: 20260228-161234-build
Status: success
Duration: 2323 ms
Skill: build_and_test

Tools:
  build     cmake --build build   success  2100ms

Changes:
  Files: 2 changed
  Lines: +15 / -3
  Budget: within limits

LLM:
  Provider: anthropic (claude-sonnet-4-20250514)
  Calls: 1
  Tokens: 1234 in / 567 out
  Cost: ~$0.0084
```

---

### `/audit <subcommand>`

稽核管理。

#### `/audit summary`

顯示稽核摘要（預設子命令）。

```
/audit
/audit summary
```

**輸出範例：**

```
Audit Summary:
  Total runs: 47
  Status: 42 passed, 3 failed, 2 partial
  Average duration: 3.2s
  Total LLM cost: ~$1.23
  Chain hash: 8a3f...c21d (verified)
```

---

#### `/audit export [options]`

匯出稽核資料。

```
/audit export
/audit export --format sarif --output report.sarif
/audit export --format html --since 2026-02-01 --until 2026-02-28
/audit export --format csv --output data.csv
```

| 選項 | 說明 | 預設 |
|------|------|------|
| `--format` | 匯出格式：`json` / `jsonl` / `csv` / `sarif` / `html` | `json` |
| `--output` | 輸出檔案路徑 | stdout |
| `--since` | 開始日期（ISO 格式） | 全部 |
| `--until` | 結束日期（ISO 格式） | 全部 |

**格式說明：**

| 格式 | 用途 |
|------|------|
| `json` | 結構化 JSON 陣列 |
| `jsonl` | 每行一筆 JSON（適合串流處理） |
| `csv` | 表格格式（適合 Excel） |
| `sarif` | OWASP SARIF（適合安全工具） |
| `html` | HTML 報告（含樣式） |

---

#### `/audit verify [run-id]`

驗證稽核鏈完整性。

```
/audit verify                      # 驗證所有紀錄
/audit verify 20260228-161234      # 驗證特定紀錄
```

**輸出：**

```
Chain Verification:
  ✓ 47 runs verified
  ✓ Chain hash: 8a3f...c21d (matches)
```

或發現篡改時：

```
Chain Verification:
  ✗ Hash mismatch at run 20260228-161234-build
    Expected: 8a3f...
    Computed: 5b2e...
  ⚠ Evidence may have been tampered with
```

---

## 8. 安全性

### `/security <subcommand>`

#### `/security keygen`

生成 Ed25519 金鑰對。

```
/security keygen
```

**輸出：**

```
✓ Generated ed25519 key pair:
  Private key: .fwai/keys/evidence.key
  Public key:  .fwai/keys/evidence.pub
```

啟用簽章：將 `config.yaml` 中的 `security.signing.enabled` 設為 `true`。

---

#### `/security verify <run-id>`

驗證特定 Evidence 的數位簽章。

```
/security verify 20260228-161234-build
```

---

#### `/security verify-all`

驗證所有最近的 Evidence 簽章。

```
/security verify-all
```

---

#### `/security scan`

掃描原始碼中的秘密（密碼、API key 等）。

```
/security scan
```

使用 `config.yaml` 中的 `security.secret_patterns` 進行匹配。

**輸出範例：**

```
Secret Scan Results:
  Scanned: 42 files
  ⚠ Found 2 potential secrets:
    src/config.h:14     — matches "api_key"
    src/wifi.c:42       — matches "password ="
```

---

#### `/security audit-deps`

檢查依賴安全性。

```
/security audit-deps
```

**檢查項目：**
- `npm audit`（NPM 漏洞掃描）
- 插件完整性驗證（checksum 比對）
- 工具鏈二進位檢查

---

### `/policy <subcommand>`

#### `/policy show`

顯示合併後的策略（預設子命令）。

```
/policy
/policy show
```

顯示 project policy + org policy 合併後的完整策略。

---

#### `/policy validate`

驗證目前設定是否符合組織策略要求。

```
/policy validate
```

**輸出範例：**

```
Policy Validation:
  ✓ Signing: required and enabled
  ✓ SBOM: required and enabled
  ✗ Blocked tools: "bash" is blocked by org policy
  ⚠ Max LLM cost: $5.00/run (current: unlimited)
```

---

#### `/policy refresh`

從 URL 或檔案重新載入組織策略。

```
/policy refresh
```

---

#### `/policy diff`

顯示組織策略的覆蓋項。

```
/policy diff
```

---

## 9. 插件與授權

### `/marketplace <subcommand>`

#### `/marketplace list`

列出已安裝的插件（預設子命令）。

```
/marketplace
/marketplace list
```

---

#### `/marketplace search <query>`

搜尋插件市集。

```
/marketplace search stm32
/marketplace search rtos
```

**輸出範例：**

```
Search results for "stm32":
  stm32-bsp-tools  v1.2.0  STM32 BSP 工具集
  stm32-rtos       v0.5.0  FreeRTOS 整合
  stm32-hal        v2.0.1  HAL 驅動程式碼生成
```

---

#### `/marketplace install <name>`

安裝插件。

```
/marketplace install stm32-bsp-tools
```

安裝至 `.fwai/plugins/<name>/`。

---

#### `/marketplace uninstall <name>`

移除插件。

```
/marketplace uninstall stm32-bsp-tools
```

---

#### `/marketplace info <name>`

顯示插件詳細資訊。

```
/marketplace info stm32-bsp-tools
```

**輸出：**

```
Package: stm32-bsp-tools
Version: 1.2.0
Author: fwai-community
Description: STM32 BSP 工具集
Artifacts:
  Tools:  stm32-clock-config, stm32-pinout
  Skills: stm32-init
  Agents: stm32-expert
Checksum: sha256:a1b2c3...
```

---

### `/license <subcommand>`

#### `/license status`

顯示授權狀態（預設子命令）。

```
/license
/license status
```

**輸出：**

```
License Status:
  Tier: pro
  Valid: yes
  Features: marketplace, cloud-sync, ota, advanced-agents
  Seats: 3/5 available
  Expires: 2027-01-01
```

---

#### `/license activate <key>`

啟用授權金鑰。

```
/license activate FWAI-PRO-XXXX-XXXX-XXXX
```

---

#### `/license deactivate`

停用授權，回到 community 版。

```
/license deactivate
```

---

## 10. OTA 更新

### `/ota <subcommand>`

#### `/ota list`

列出可用的 OTA 套件（預設子命令）。

```
/ota
/ota list
```

**輸出：**

```
OTA Bundles:
  v1.2.0  2026-02-28  firmware.bin  sha256:a1b2...  git:abc1234
  v1.1.0  2026-02-15  firmware.bin  sha256:d4e5...  git:def5678
```

---

#### `/ota bundle [options]`

建立 OTA 更新套件。

```
/ota bundle
/ota bundle --version 1.3.0 --elf build/firmware.elf
```

| 選項 | 說明 | 預設 |
|------|------|------|
| `--version` | 版本號 | 自動遞增 |
| `--elf` | ELF 檔案路徑 | 自動偵測 |

---

#### `/ota deploy [options]`

部署 OTA 更新。

```
/ota deploy --target device-01
/ota deploy --all
```

| 選項 | 說明 |
|------|------|
| `--target <id>` | 部署至特定裝置 |
| `--all` | 部署至所有目標 |

---

#### `/ota status`

顯示 OTA 部署歷史。

```
/ota status
```

---

#### `/ota rollback <device-id> <version>`

回滾至指定版本。

```
/ota rollback device-01 1.1.0
```

---

## 11. 基礎設施

### `/farm <subcommand>`

Board Farm 管理。

#### `/farm list`

列出可用開發板（預設子命令）。

```
/farm
/farm list
```

**輸出：**

```
Available Boards:
  board-001       STM32F401     available
  board-002       ESP32-S3      allocated
  board-003       nRF52840      available
```

---

#### `/farm allocate <board-id>`

分配開發板。

```
/farm allocate board-001
```

---

#### `/farm release <board-id>`

釋放開發板。

```
/farm release board-001
```

---

### `/mcp <subcommand>`

MCP (Model Context Protocol) 伺服器管理。

#### `/mcp list`

列出已設定的 MCP 伺服器與連線狀態。

```
/mcp list
```

**輸出範例：**

```
MCP Servers:
  filesystem    connected     npx @modelcontextprotocol/server-filesystem
  database      disconnected  npx @modelcontextprotocol/server-sqlite
```

---

#### `/mcp status`

顯示詳細狀態，包含每台伺服器的工具數量。

```
/mcp status
```

**輸出範例：**

```
MCP Server Status:
  filesystem:
    Status: connected
    Tools: 4 (read_file, write_file, list_dir, search)
  database:
    Status: disconnected
    Tools: 0
```

---

#### `/mcp tools`

列出所有已發現的 MCP 工具。

```
/mcp tools
```

**輸出範例：**

```
MCP Tools:
  mcp_filesystem_read_file    Read a file from the filesystem
  mcp_filesystem_write_file   Write content to a file
  mcp_filesystem_list_dir     List directory contents
  mcp_filesystem_search       Search for files by pattern
```

---

#### `/mcp restart <name>`

重新啟動指定 MCP 伺服器。

```
/mcp restart filesystem
```

---

### `/kb <subcommand>`

Knowledge Base 管理。

#### `/kb status`

顯示 KB 索引狀態。

```
/kb status
```

**輸出範例：**

```
Knowledge Base Status:
  Documents: 12
  Embedding model: text-embedding-3-small
  Index built: 2026-02-28T15:00:00Z
  Semantic weight: 0.5
```

---

#### `/kb index`

建置/重建嵌入向量索引。

```
/kb index
```

從 `.fwai/kb/` 中的文件生成嵌入向量，儲存至 `.fwai/kb/.embeddings.json`。

---

#### `/kb search <query>`

執行混合搜尋（關鍵字 + 語意）。

```
/kb search UART DMA transfer
```

**輸出範例：**

```
KB Search Results:
  1. uart-dma-guide.md          score: 0.92
  2. dma-troubleshooting.md     score: 0.78
  3. peripheral-overview.md     score: 0.45
```

---

## 附錄 A：環境變數

| 變數 | 說明 | 用途 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API 金鑰 | Provider: anthropic |
| `OPENAI_API_KEY` | OpenAI API 金鑰 | Provider: openai |
| `GOOGLE_API_KEY` | Google Gemini API 金鑰 | Provider: gemini |
| `BOARD_FARM_API_KEY` | Board Farm API 金鑰 | Board Farm 客戶端 |
| `FWAI_LOG_LEVEL` | 日誌層級覆蓋 | 除錯用 |

---

## 附錄 B：設定檔位置

| 檔案 | 路徑 | 說明 |
|------|------|------|
| 全域設定 | `.fwai/config.yaml` | LLM、安全策略、模式 |
| 專案設定 | `.fwai/project.yaml` | MCU、建置、序列埠 |
| 工具定義 | `.fwai/tools/*.tool.yaml` | 建置/燒錄/監控等 |
| Skill 定義 | `.fwai/skills/*.skill.yaml` | 多步驟工作流程 |
| Agent 定義 | `.fwai/agents/*.agent.yaml` | AI Agent 設定 |
| 執行紀錄 | `.fwai/runs/<run_id>/evidence.json` | Evidence 紀錄 |
| 稽核日誌 | `.fwai/logs/audit.jsonl` | 追加式稽核日誌 |
| 簽章金鑰 | `.fwai/keys/evidence.key` | Ed25519 私鑰 |
| 驗證金鑰 | `.fwai/keys/evidence.pub` | Ed25519 公鑰 |
| KB 文件 | `.fwai/kb/*.md` / `*.txt` | 知識庫內容 |
| KB 嵌入索引 | `.fwai/kb/.embeddings.json` | 向量索引 |
| OTA 套件 | `.fwai/ota/<version>/` | OTA 更新套件 |
| 插件 | `.fwai/plugins/<name>/` | 已安裝插件 |
| 授權快取 | `.fwai/license.json` | 授權狀態快取 |

---

## 附錄 C：工具定義格式

**`.fwai/tools/<name>.tool.yaml`**：

```yaml
name: build                          # 工具名稱（必填）
description: Build firmware           # 說明（選填）
command: cmake --build build          # 執行命令（必填）
working_dir: .                        # 工作目錄（預設 "."）
timeout_sec: 300                      # 逾時秒數（預設 120）
requires:                             # 前置需求（選填）
  - cmake
guard:                                # 安全防護（選填）
  require_confirmation: false
  message: "This will overwrite..."
variables:                            # 環境變數（選填）
  BUILD_TYPE: Release
success_patterns:                     # 成功判斷 regex（選填）
  - "Built target firmware"
  - "\\[100%\\]"
failure_patterns:                     # 失敗判斷 regex（選填）
  - "error:"
  - "undefined reference"
stop_conditions:                      # 停止條件（選填）
  - type: timeout
    timeout_sec: 60
  - type: match
    patterns: ["PANIC", "HardFault"]
artifacts:                            # 產出檔案（選填）
  - path: build/firmware.elf
    label: firmware
  - path: build/firmware.bin
    label: binary
```

---

## 附錄 D：Skill 定義格式

**`.fwai/skills/<name>.skill.yaml`**：

```yaml
name: full_pipeline                   # Skill 名稱（必填）
description: Complete CI pipeline     # 說明（選填）
agent: default                        # 使用的 Agent（選填）
triggers:                             # 自然語言觸發詞（選填）
  - "run full pipeline"
  - "complete build test flash"
steps:                                # 步驟序列（必填）
  # 工具步驟
  - tool: build
    on_fail: abort                    # abort | continue | retry

  # 工具步驟（失敗繼續）
  - tool: test
    on_fail: continue

  # Evidence 記錄步驟
  - action: evidence
    summary: true

  # LLM 分析步驟
  - action: llm_analyze
    input: "build.log"
    prompt: "分析建置結果，指出警告和潛在問題"

  # Agentic 步驟
  - action: agentic
    goal: "檢查程式碼品質並提出改善建議"
    agent: reviewer
    max_iterations: 10
    tools:
      - read_file
      - grep
      - glob
```

---

## 附錄 E：Agent 定義格式

**`.fwai/agents/<name>.agent.yaml`**：

```yaml
name: bsp                            # Agent 名稱（必填）
description: BSP specialist           # 說明（選填）
model: inherit                        # 模型："inherit" 或指定 model ID
system_prompt: |                      # 系統提示（必填）
  你是韌體 BSP 專家。
  協助使用者處理硬體抽象層。
allowed_paths:                        # 可存取路徑（選填，glob）
  - "src/bsp/**"
  - "include/bsp/**"
protected_paths:                      # 禁止寫入路徑（選填，glob）
  - "src/bsp/bootloader*"
tools:                                # 可用工具（選填，空=全部）
  - read_file
  - write_file
  - edit_file
  - grep
  - glob
  - bash
max_iterations: 30                    # 最大迭代次數（選填，預設 50）
temperature: 0.1                      # 溫度（選填，預設 0.2）
```
