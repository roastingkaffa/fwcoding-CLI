# FWAI — Firmware AI Assistant (VS Code)

VS Code 前端，把 [fwai CLI](../fwai/) 的建置／燒錄／監看流程、Evidence 紀錄與 AI 對話搬進 IDE。

> 版本 0.1.0 | 對照 commit `9a3f25f` | 需要 VS Code ^1.85.0

擴充功能在工作區含有 `.fwai/config.yaml` 時自動啟用（`workspaceContains`）。沒有這個檔案就不會載入 —— 先在專案根目錄跑 `fwai init`，或用 `FWAI: Initialize Workspace`。

---

## 兩套通訊機制

這是理解整個擴充功能最重要的一點：它用**兩種不同方式**跟 fwai 溝通，用途不同。

| 機制 | 檔案 | 用途 | 使用者 |
|------|------|------|--------|
| **spawn CLI** | `lib/cli-runner.ts` | 執行類操作 —— 會動到硬體或檔案、需要串流輸出、需要離開碼 | `init` `build` `flash` `doctor` `run-skill` `provider` |
| **行程內載入 lib** | `lib/fwai-bridge.ts` | 讀取類操作 —— 載入設定、列出 skill/agent、讀 evidence | `fwai-context` `chat-panel` `memory-panel` |

`spawnFwai()` 用的是 `spawn`（不是 `exec`），並設 `NO_COLOR=1` 讓輸出乾淨。

`getFwaiLib()` 用**動態 `import()`** 載入 `fwai/lib`：VS Code 擴充是 CJS，fwai 是 ESM，靜態 import 接不起來，動態 import 是這個落差的橋。結果會被快取，只載入一次。

選擇原則：**會改變狀態的走 CLI**（拿得到離開碼與逐行輸出），**只是讀取的走 lib**（省下行程啟動成本）。

---

## 指令

命令面板（`Ctrl+Shift+P`）輸入 `FWAI:` 即可看到全部 20 個。

### 已接上 CLI 的（13 個）

| 指令 | 說明 |
|------|------|
| `FWAI: Initialize Workspace` | 建立 `.fwai/` 工作區 |
| `FWAI: Build` | 建置，並把編譯錯誤送進「問題」面板 |
| `FWAI: Flash Device` | 燒錄（沿用 CLI 的 flash guard） |
| `FWAI: Monitor Serial` | 開終端機監看 UART |
| `FWAI: Run Skill` | 選一個 skill 執行 |
| `FWAI: Agent Chat` | 開啟聊天視圖 |
| `FWAI: Doctor` | 環境健康檢查 |
| `FWAI: Show Evidence` | 開啟執行紀錄詳情 |
| `FWAI: Analyze Memory` | 記憶體用量視覺化 |
| `FWAI: Switch LLM Provider` | 切換 provider |
| `FWAI: Open REPL` | 在終端機開 `fwai` |
| `FWAI: Refresh Views` | 重新整理四個側邊欄樹狀檢視 |
| `FWAI: Show Config` | 開啟 `.fwai/config.yaml` |

### 尚未接上 CLI 的（7 個）

以下指令**已註冊、點得到、會跳出選單，但選完只會往「FWAI」輸出頻道寫一行字**，不會真的執行任何動作。CLI 端的功能都已實作，只是擴充功能這側還沒接：

| 指令 | 對應的 CLI 功能 |
|------|----------------|
| `FWAI: Plugin Marketplace` | `/marketplace` |
| `FWAI: License Status` | `/license` |
| `FWAI: Audit Export` | `/audit`（`fwai audit` 也可在終端機直接用） |
| `FWAI: OTA Deploy` | `/ota`（`fwai ota` 同上） |
| `FWAI: Debug (GDB)` | `/debug` |
| `FWAI: Security` | `/security` |
| `FWAI: Org Policy` | `/policy` |

在接上之前，這些操作請用整合終端機直接跑 CLI。

---

## 側邊欄與面板

活動列的 **FWAI** 圖示底下有四個樹狀檢視：**Evidence**、**Skills**、**Agents**、**Tools**。

**FWAI Chat** 是面板區的 webview 檢視（`WebviewViewProvider`），支援串流輸出；
**Evidence Detail** 與 **Memory Analysis** 則是獨立的 webview 分頁（`createWebviewPanel`）。

> **已知問題**：`package.json` 宣告了第五個檢視 `fwai.pluginsView`（Plugins），
> 但 `extension.ts` 沒有為它註冊任何 provider。這個檢視會出現在側邊欄且永遠是空的。
> 修法是二選一：補上 provider，或從 `contributes.views` 移除該項。

---

## 狀態列

左下角兩個項目：

- `$(circuit-board) FWAI: <專案> | <MCU>` — 點擊開啟 `config.yaml`
- `$(cloud) <模型>`，未設定時顯示 `$(cloud-offline) No LLM` — 點擊切換 provider

可用 `fwai.showStatusBar` 關閉。

---

## 建置錯誤 → 問題面板

`FWAI: Build` 會用 `providers/diagnostics.ts` 解析輸出，比對 GCC 格式
（`file:line:col: error|warning: message`），轉成 VS Code 診斷。
`error` 對應 Error、其餘對應 Warning，可在「問題」面板點擊跳轉。

只支援 GCC 風格輸出 —— 其他編譯器格式不會被解析。

---

## 任務

Skill 會自動變成 VS Code 任務（type `fwai`），`Terminal → Run Task` 就看得到。
也可以寫進 `.vscode/tasks.json`：

```jsonc
{
  "type": "fwai",
  "operation": "run",
  "skill": "bringup"
}
```

實際執行的是 `<cliPath> run <skill> --json`。

---

## 設定

| 設定 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `fwai.cliPath` | string | `"fwai"` | fwai 執行檔路徑。未全域安裝時填絕對路徑 |
| `fwai.autoRefreshEvidence` | boolean | `true` | 執行結束後自動重整 Evidence 檢視 |
| `fwai.showStatusBar` | boolean | `true` | 顯示狀態列項目 |
| `fwai.chat.streamingEnabled` | boolean | `true` | 聊天面板串流輸出 |

---

## 開發

```bash
cd vscode-fwai
npm install
npm run build      # tsc → dist/
npm run bundle     # esbuild 打包成單檔
npm run lint       # tsc --noEmit
npm test           # node --import tsx --test src/test/suite/*.test.ts
```

按 `F5` 開啟 Extension Development Host。測試的工作區需要有 `.fwai/config.yaml`，
否則 `activate()` 會直接 return（沒有工作區資料夾時亦然）。

`fwai.cliPath` 預設是 `fwai`，開發時如果沒有 `npm link` 過，請指到
`<repo>/fwai/dist/cli.js` 或先在 `fwai/` 執行 `npm link`。

現有測試涵蓋 `cli-runner`、`fwai-bridge`、`evidence-tree` 與 `extension`
四個模組（`src/test/suite/`）。

---

## 架構

`../fwai/docs/architecture.md` 第 14 節有分層說明；
`../fwai/docs/architecture-overview.html` 是 CLI 端的圖解版。
