# fwai User Manual

> Version: 0.1.0 | Last updated: 2026-02-27

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Installation](#2-installation)
3. [Quick Start (No Hardware)](#3-quick-start-no-hardware)
4. [Workspace Setup](#4-workspace-setup)
5. [Configuration Reference](#5-configuration-reference)
6. [Tools](#6-tools)
7. [Skills](#7-skills)
8. [Interactive REPL](#8-interactive-repl)
9. [Non-Interactive Mode (CLI)](#9-non-interactive-mode-cli)
10. [CI/CD Integration](#10-cicd-integration)
11. [Evidence System](#11-evidence-system)
12. [Safety Policy Engine](#12-safety-policy-engine)
13. [LLM Integration](#13-llm-integration)
14. [Natural Language & Intent Resolution](#14-natural-language--intent-resolution)
15. [Environment Doctor](#15-environment-doctor)
16. [Exit Codes](#16-exit-codes)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Introduction

**fwai** (Firmware AI CLI) is a command-line tool that brings AI-assisted development workflows to firmware engineering. It automates build/flash/monitor cycles, collects structured evidence for every run, enforces safety policies, and integrates LLM-powered analysis — all tailored for embedded hardware projects.

### Key Capabilities

| Capability | Description |
|-----------|-------------|
| Automated workflows | Define build → flash → monitor → evidence pipelines as YAML "skills" |
| Evidence traceability | Every run produces timestamped `evidence.json` with tool results, boot status, timing, hardware state, git info |
| Safety guardrails | Protected file paths, change budgets, flash confirmation, build-success guards |
| Boot detection | Real-time pattern matching on UART output to detect boot success or failure |
| LLM analysis | AI-powered build log analysis, error diagnosis, natural language interaction |
| CI-native | `--ci`, `--json`, `--quiet` flags for pipeline integration |

---

## 2. Installation

### Prerequisites

- **Node.js** >= 20.0.0
- **Git** (recommended, for diff/budget features)
- No hardware or toolchain needed to try the mock example

### Install from Source

```bash
git clone https://github.com/roastingkaffa/fwcoding-CLI.git
cd fwcoding-CLI/fwai
npm install
npm run build
```

The CLI entry point is at `dist/cli.js`. Run it with:

```bash
node dist/cli.js --help
```

Or create a symlink for convenience:

```bash
npm link
fwai --help
```

---

## 3. Quick Start (No Hardware)

The `examples/mock-stm32/` directory contains a complete workspace where all tools use `echo` commands to simulate a real STM32F407 development board. This lets you experience the full workflow in under 10 seconds.

```bash
cd examples/mock-stm32
node ../../fwai/dist/cli.js run bringup --ci --yes
```

Expected output:

```
Running skill: bringup
ℹ Running build: echo 'Compiling firmware...' ...
✓ build completed (105ms)
ℹ Running flash: echo 'Connecting to target...' ...
✓ flash completed (103ms)
ℹ Running monitor: echo 'Bootloader starting...' ...
✓ Boot pattern matched: System Ready
✓ monitor completed (305ms)
✓ Evidence written to .fwai/runs/.../evidence.json
ℹ Evidence: SUCCESS [build ✓, flash ✓, monitor ✓]
ℹ Boot: success (304ms) — "System Ready"
```

To see the evidence as JSON:

```bash
cat .fwai/runs/*/evidence.json | python3 -m json.tool
```

To get machine-readable output:

```bash
node ../../fwai/dist/cli.js run bringup --ci --yes --json
```

---

## 4. Workspace Setup

### Initializing a Workspace

Navigate to your firmware project root and run:

```bash
fwai init
```

This creates the `.fwai/` directory with the following structure:

```
.fwai/
├── agents/              # Agent persona definitions
│   ├── bsp.agent.yaml
│   ├── driver.agent.yaml
│   ├── release.agent.yaml
│   └── rtos.agent.yaml
├── skills/              # Workflow definitions
│   ├── bringup.skill.yaml
│   ├── build-fix.skill.yaml
│   └── diagnose.skill.yaml
├── tools/               # Tool definitions
│   ├── build.tool.yaml
│   ├── flash.tool.yaml
│   └── monitor.tool.yaml
├── kb/                  # Knowledge base (future)
├── logs/                # Doctor cache, debug logs
├── mcp/                 # MCP server configs (future)
├── runs/                # Evidence output (gitignored)
├── config.yaml          # Global configuration
├── project.yaml         # Hardware project definition
└── .gitignore           # Ignores runs/ and logs/
```

Options:

| Flag | Description |
|------|-------------|
| `--force`, `-f` | Overwrite an existing `.fwai/` directory |

After initialization, edit the two core files:

1. **`.fwai/project.yaml`** — Set your MCU, serial port, boot patterns, toolchain
2. **`.fwai/config.yaml`** — Set your LLM provider and API key

### Re-initializing

If `.fwai/` already exists, `fwai init` will refuse unless you pass `--force`:

```bash
fwai init --force
```

> **Warning:** `--force` deletes the entire existing `.fwai/` directory including any custom tools/skills.

---

## 5. Configuration Reference

### 5.1 `config.yaml`

The main configuration file controls LLM provider, safety policy, intent resolution, run mode, and logging.

```yaml
version: "1.0"

# LLM Provider
provider:
  name: anthropic           # anthropic | openai | gemini | local
  model: claude-sonnet-4-20250514
  api_key_env: ANTHROPIC_API_KEY  # Environment variable name (not the key itself)
  max_tokens: 4096          # Max response tokens
  temperature: 0.2          # 0.0 = deterministic, 2.0 = creative

# Safety Policy
policy:
  protected_paths:           # Glob patterns — changes blocked
    - "boot/**"
    - "partition_table/**"
    - "*.ld"
    - "*.icf"
  change_budget:
    max_files_changed: 5     # Max files in git diff HEAD
    max_lines_changed: 200   # Max total added+removed lines
  flash_guard:
    require_confirmation: true   # Prompt before flash
    require_build_success: true  # Must have a successful build before flash
  require_evidence: true     # Evidence step required in skills

# Intent Resolution (for natural language in REPL)
intent:
  confidence_threshold_auto: 0.8  # >= this: auto-execute skill
  confidence_threshold_ask: 0.6   # >= this: ask user to confirm

# Run Mode
mode:
  default: interactive       # interactive | ci
  ci:
    max_total_duration_sec: 600  # Watchdog timeout for CI runs

# Logging
logging:
  level: info                # debug | info | warn | error
  color: true                # ANSI colors (auto-disabled when piped)
```

### 5.2 `project.yaml`

Defines your hardware target, serial port, boot detection patterns, and toolchain.

```yaml
project:
  name: my-firmware-project
  description: "Description of the project"

  target:
    mcu: STM32F407VG           # MCU part number
    arch: arm-cortex-m4        # CPU architecture
    board: STM32F4-Discovery   # Board name
    flash_size: 512KB          # Flash memory size
    ram_size: 128KB            # RAM size

  build:
    system: cmake              # cmake | make | west | idf.py | platformio | keil | iar
    build_dir: build
    source_dir: src
    entry_point: main.c

  serial:
    port: /dev/ttyUSB0         # Serial port path
    baud: 115200               # Baud rate

  boot:
    success_patterns:          # Regex patterns — boot considered successful
      - "System Ready"
      - "Boot complete"
    failure_patterns:          # Regex patterns — boot considered failed
      - "PANIC"
      - "Hard Fault"
      - "WDT Reset"
      - "Stack overflow"

  toolchain:
    compiler: arm-none-eabi-gcc
    debugger: openocd
    flasher: openocd
```

All `boot.success_patterns` and `boot.failure_patterns` are treated as regular expressions. They are matched line-by-line against real-time UART output during the monitor step.

---

## 6. Tools

Tools are the atomic units of execution. Each tool wraps a shell command and defines patterns for success/failure detection.

### 6.1 Tool Definition Format

Tools are stored as `.fwai/tools/<name>.tool.yaml`:

```yaml
name: build
description: "Compile firmware project"
command: "cmake --build build --parallel"
working_dir: "."
timeout_sec: 120

# Post-exit pattern matching (checked against log file after command completes)
success_patterns:
  - "Build complete"
  - "\\[100%\\]"
failure_patterns:
  - "error:"
  - "FAILED"

# Optional: artifacts to collect
artifacts:
  - path: "build/*.bin"
    label: firmware_binary
  - path: "build/*.elf"
    label: firmware_elf

# Optional: require user confirmation before running
guard:
  require_confirmation: true
  message: "Flash target device? (y/N) "

# Optional: tool-level variables (interpolated with ${...} syntax)
variables:
  port: "${project.serial.port}"
  baud: "${project.serial.baud}"

# Optional: stop conditions for real-time tools (monitor)
stop_conditions:
  - type: timeout
    value: 30
  - type: boot_patterns       # Inherit patterns from project.yaml
    inherit: true
  - type: match               # Custom stop pattern
    pattern: "custom_pattern"
```

### 6.2 Variable Interpolation

Tool commands and variables support `${...}` interpolation:

| Variable | Resolves To |
|----------|-------------|
| `${project.serial.port}` | Serial port from project.yaml |
| `${project.serial.baud}` | Baud rate from project.yaml |
| `${project.target.mcu}` | MCU name from project.yaml |
| `${run_dir}` | Current run directory (e.g., `.fwai/runs/20260226-153457-bringup`) |

### 6.3 Pattern Matching

Tools have two pattern-matching modes:

**Post-exit matching** (build, flash): After the command completes, the log file is checked against `success_patterns` (if exit code = 0) or `failure_patterns` (if exit code != 0).

**Real-time matching** (monitor): Lines are checked as they arrive. When a pattern matches, the process is terminated and boot status is recorded. Configured via `stop_conditions` with `type: boot_patterns` or `type: match`.

### 6.4 Guards

Tools with `guard.require_confirmation: true` will:
- In **interactive mode**: prompt the user for confirmation
- In **CI mode without `--yes`**: reject with exit code 3
- In **CI mode with `--yes`**: skip confirmation and proceed

---

## 7. Skills

Skills are multi-step workflows that combine tools and actions into a pipeline.

### 7.1 Skill Definition Format

Skills are stored as `.fwai/skills/<name>.skill.yaml`:

```yaml
name: bringup
description: "Full board bring-up: build -> flash -> monitor -> evidence"
agent: bsp                   # Optional: associated agent persona
steps:
  - tool: build              # Run the build tool
    on_fail: abort           # abort | continue | retry
  - tool: flash
    on_fail: abort
  - tool: monitor
    config:
      timeout_sec: 15        # Override tool-level config
    on_fail: continue
  - action: evidence         # Write evidence.json
    summary: true            # Print summary to console
triggers:                    # Natural language triggers for REPL
  - bringup
  - bring-up
  - "board bring up"
  - "build and flash"
```

### 7.2 Step Types

| Step Type | Format | Description |
|-----------|--------|-------------|
| Tool step | `tool: <name>` | Execute a tool by name |
| Evidence step | `action: evidence` | Generate `evidence.json` for the current run |
| LLM analyze step | `action: llm_analyze` | Send a file to the LLM for analysis |

### 7.3 Failure Handling

The `on_fail` field controls behavior when a step fails:

| Value | Behavior |
|-------|----------|
| `abort` | Stop the skill immediately (default) |
| `continue` | Log the failure and proceed to the next step |
| `retry` | Retry the step (future) |

### 7.4 LLM Analyze Step

The `llm_analyze` step reads a file and sends it to the configured LLM with a prompt:

```yaml
- action: llm_analyze
  input: "${run_dir}/build.log"
  prompt: |
    Analyze this firmware build log. Identify the root cause of errors.
    Suggest specific fixes with file paths and line numbers.
```

The LLM automatically receives project context (MCU, architecture, compiler, memory sizes) as part of the system prompt.

### 7.5 Built-in Skills

| Skill | Steps | Description |
|-------|-------|-------------|
| `bringup` | build → flash → monitor → evidence | Full board bring-up cycle |
| `build-fix` | build → llm_analyze → evidence | Build and diagnose errors with AI |
| `diagnose` | monitor → llm_analyze → evidence | Capture UART and diagnose with AI |

---

## 8. Interactive REPL

Start the REPL by running `fwai` with no subcommand (from a directory with `.fwai/`):

```bash
fwai
```

### 8.1 REPL Commands

| Command | Description |
|---------|-------------|
| `/help` | List all available commands |
| `/build` | Run the build tool, collect `build.log` |
| `/flash` | Flash firmware to target (prompts for confirmation) |
| `/monitor [seconds]` | Capture UART output (optional duration override) |
| `/evidence` | List the 5 most recent runs |
| `/evidence <id>` | Show detailed evidence for a specific run |
| `/evidence #1` | Show the most recent run (by index) |
| `/config` | Display current configuration summary |
| `/skills` | List available skills |
| `/agents` | List configured agents |
| `/doctor` | Run environment health check |
| `/exit` or `/quit` | Exit the REPL |

### 8.2 Natural Language

Any input that doesn't start with `/` is processed as natural language:

- **High-confidence skill match** (>= 0.8): automatically executes the skill
- **Medium-confidence match** (0.6 – 0.8): asks you to confirm
- **Low confidence** (< 0.6): falls through to free-form LLM conversation

Examples:

```
fwai> bringup                    → runs bringup skill (exact trigger match)
fwai> help me do a board bringup → runs bringup skill (keyword match)
fwai> why is my build failing    → may match build-fix skill or start a conversation
fwai> what is a mutex            → free-form LLM conversation
```

### 8.3 Conversation History

Free-form conversations maintain history within the session. The LLM receives full project context (MCU, architecture, memory sizes, compiler) automatically.

---

## 9. Non-Interactive Mode (CLI)

### 9.1 Running a Skill

```bash
fwai run <skill-name> [options]
```

| Option | Description |
|--------|-------------|
| `--ci` | CI mode: disable interactive prompts, enable watchdog timer |
| `--yes` | Auto-confirm destructive actions (flash) |
| `--json` | Output a single JSON summary to stdout (suppresses all other stdout) |
| `--quiet` | Suppress all stdout output |

### 9.2 Examples

```bash
# Run bringup interactively (will prompt for flash confirmation)
fwai run bringup

# Run bringup in CI mode (requires --yes for flash)
fwai run bringup --ci --yes

# Get machine-readable JSON output
fwai run bringup --ci --yes --json

# Silent mode (only exit code matters)
fwai run bringup --ci --yes --quiet
```

### 9.3 JSON Output Format

When `--json` is used, a single JSON line is written to stdout after the run completes:

```json
{
  "run_id": "20260226-153457-bringup",
  "status": "success",
  "exit_code": 0,
  "tools": [
    { "tool": "build", "status": "success", "duration_ms": 105 },
    { "tool": "flash", "status": "success", "duration_ms": 103 },
    { "tool": "monitor", "status": "success", "duration_ms": 305 }
  ],
  "boot_status": {
    "status": "success",
    "matched_pattern": "System Ready",
    "boot_time_ms": 304
  },
  "evidence_path": ".fwai/runs/20260226-153457-bringup/evidence.json",
  "estimated_cost_usd": null
}
```

The `status` field values: `success`, `tool_failure`, `ci_guard_rejected`, `budget_exceeded`, `skill_not_found`, `timeout`.

### 9.4 Non-TTY Behavior

When stdout is piped (not a terminal), ANSI color codes are automatically disabled, even without `--json` or `--quiet`. This ensures clean output for log files and downstream tools.

---

## 10. CI/CD Integration

### 10.1 GitHub Actions Example

```yaml
name: Firmware CI
on: [push, pull_request]

jobs:
  bringup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install fwai
        run: cd fwai && npm ci && npm run build

      - name: Run bringup
        run: |
          cd examples/mock-stm32
          node ../../fwai/dist/cli.js run bringup --ci --yes --json > result.json

      - name: Check result
        run: |
          status=$(python3 -c "import json; print(json.load(open('examples/mock-stm32/result.json'))['status'])")
          echo "Status: $status"
          [ "$status" = "success" ] || exit 1

      - name: Upload evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: evidence
          path: examples/mock-stm32/.fwai/runs/*/evidence.json
```

### 10.2 CI Watchdog

When `--ci` is set, a watchdog timer runs based on `mode.ci.max_total_duration_sec` in `config.yaml` (default: 600 seconds). If the skill exceeds this timeout, the process is killed with exit code 7.

### 10.3 CI Guard

Tools with `guard.require_confirmation: true` (like flash) will reject in CI mode unless `--yes` is explicitly passed. This prevents accidental hardware operations in automated pipelines. Rejection produces exit code 3.

---

## 11. Evidence System

Every tool execution produces an evidence record stored in `.fwai/runs/<run-id>/`.

### 11.1 Run Directory Structure

```
.fwai/runs/20260226-153457-bringup/
├── evidence.json    # Structured run evidence
├── build.log        # Build tool output
├── flash.log        # Flash tool output
├── uart.log         # Monitor tool output
└── diff.patch       # Git diff at time of run (if in a git repo)
```

### 11.2 evidence.json Schema

```json
{
  "run_id": "20260226-153457-bringup",
  "skill": "bringup",
  "start_time": "2026-02-26T15:34:57.000Z",
  "end_time": "2026-02-26T15:34:58.500Z",
  "duration_ms": 1500,
  "status": "success",

  "tools": [
    {
      "tool": "build",
      "command": "cmake --build build --parallel",
      "exit_code": 0,
      "duration_ms": 500,
      "log_file": "build.log",
      "status": "success",
      "pattern_matched": "Build complete"
    }
  ],

  "boot_status": {
    "status": "success",
    "matched_pattern": "System Ready",
    "boot_time_ms": 304
  },

  "hardware": {
    "serial_port": "/dev/ttyUSB0",
    "debugger": "openocd",
    "connection_type": "jtag/swd",
    "detected_device": "STM32F407xx",
    "flash_verified": true
  },

  "changes": {
    "files_changed": 2,
    "lines_added": 15,
    "lines_removed": 3,
    "diff_path": "diff.patch",
    "within_budget": true
  },

  "project": {
    "name": "my-firmware-project",
    "target_mcu": "STM32F407VG",
    "arch": "arm-cortex-m4",
    "board": "STM32F4-Discovery",
    "flash_size": "512KB",
    "ram_size": "128KB",
    "git_branch": "main",
    "git_commit": "abc1234"
  },

  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "calls": [
      {
        "purpose": "llm_analyze",
        "model": "claude-sonnet-4-20250514",
        "input_tokens": 1200,
        "output_tokens": 350,
        "duration_ms": 2000,
        "timestamp": "2026-02-26T15:34:58.000Z"
      }
    ],
    "total_input_tokens": 1200,
    "total_output_tokens": 350,
    "estimated_cost_usd": 0.0045
  }
}
```

### 11.3 Status Values

| Status | Meaning |
|--------|---------|
| `success` | All tools completed successfully |
| `partial` | Some tools succeeded, some failed |
| `fail` | All tools failed |
| `aborted` | Skill was aborted (on_fail: abort triggered) |

### 11.4 Viewing Evidence in REPL

```
fwai> /evidence          # List recent 5 runs
fwai> /evidence #1       # Show most recent run detail
fwai> /evidence 20260226 # Partial match by run-id prefix
```

The detail view shows: status, timing, project info, per-tool results, hardware state, boot status, git changes, and LLM token usage.

---

## 12. Safety Policy Engine

The policy engine prevents accidental damage to hardware and codebase.

### 12.1 Protected Paths

Files matching `policy.protected_paths` glob patterns cannot be modified. If a tool step detects changes to protected files, the operation is blocked.

```yaml
policy:
  protected_paths:
    - "boot/**"           # Bootloader files
    - "partition_table/**" # Partition tables
    - "*.ld"              # Linker scripts
    - "*.icf"             # IAR linker configs
```

### 12.2 Change Budget

Before each build step, fwai checks `git diff HEAD` against the configured budget:

```yaml
policy:
  change_budget:
    max_files_changed: 5
    max_lines_changed: 200
```

When the budget is exceeded:
- **Interactive mode**: warning is shown, execution continues
- **CI mode**: execution is aborted with exit code 4

Budget exceeded output includes a per-file breakdown and suggested patch splits grouped by directory.

### 12.3 Flash Guard

The flash guard prevents flashing without a successful build:

```yaml
policy:
  flash_guard:
    require_confirmation: true    # Prompt before flashing
    require_build_success: true   # Must have a recent successful build
```

- `require_confirmation`: In interactive mode, prompts the user. In CI, requires `--yes`.
- `require_build_success`: Checks the most recent evidence for a successful build. If none found, flash is blocked.

---

## 13. LLM Integration

### 13.1 Supported Providers

| Provider | `provider.name` | `api_key_env` |
|----------|-----------------|---------------|
| Anthropic (Claude) | `anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI (GPT) | `openai` | `OPENAI_API_KEY` |

### 13.2 Setup

Set your API key as an environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or for OpenAI:

```bash
export OPENAI_API_KEY=sk-...
```

Then update `.fwai/config.yaml`:

```yaml
provider:
  name: anthropic
  model: claude-sonnet-4-20250514
  api_key_env: ANTHROPIC_API_KEY
```

### 13.3 No-LLM Mode

fwai works fully without an LLM. All tool commands (`/build`, `/flash`, `/monitor`), skills, evidence, and policy features function normally. Only these features require an LLM:

- `llm_analyze` skill steps
- Free-form conversation in the REPL
- Tier 3 intent resolution (LLM-based classification)

### 13.4 Project Context Injection

Every LLM call automatically includes your project context in the system prompt:

- Project name, MCU, architecture, board
- Flash size, RAM size
- Compiler and version (from `fwai doctor` cache)
- Git branch and commit

This means the AI understands your hardware constraints without you needing to explain them.

### 13.5 LLM Tracing

All LLM calls are recorded in `evidence.json` under the `llm` field, including:

- Token counts (input/output)
- Cost estimates
- Duration
- Per-call purpose and metadata

---

## 14. Natural Language & Intent Resolution

When you type text in the REPL (without a `/` prefix), fwai uses a three-tier intent resolution system:

### Tier 1 — Exact Command Match (confidence: 1.0)

Input exactly matches a skill trigger or skill name:

```
fwai> bringup         → runs bringup skill
fwai> build and flash → runs bringup skill (exact trigger)
```

### Tier 2 — Keyword Trigger Match (confidence: 1.0)

Input contains keywords from a skill's trigger list:

```
fwai> help me do a bringup → matches "bringup" trigger
```

### Tier 3 — LLM Classification (confidence: varies)

If Tiers 1 and 2 don't match and an LLM is available, the input is sent to the LLM for classification. The LLM returns a skill name and confidence score.

### Confidence Thresholds

| Confidence | Behavior (interactive) | Behavior (CI) |
|------------|----------------------|---------------|
| >= 0.8 | Auto-execute skill | Auto-execute skill |
| 0.6 – 0.8 | Ask user to confirm | Skip (no prompt) |
| < 0.6 | Free-form LLM chat | Skip |

Thresholds are configurable in `config.yaml`:

```yaml
intent:
  confidence_threshold_auto: 0.8
  confidence_threshold_ask: 0.6
```

---

## 15. Environment Doctor

The `fwai doctor` command checks your development environment:

```bash
fwai doctor
```

Checks performed:

| Check | Description |
|-------|-------------|
| git | Git installed and on PATH |
| node | Node.js installed |
| git repo | Current directory is a git repository |
| .fwai/ | Workspace exists |
| config.yaml | Valid YAML, passes schema validation |
| project.yaml | Valid YAML, passes schema validation |
| Compiler | Configured compiler found (e.g., `arm-none-eabi-gcc`) |
| Debugger | Configured debugger found (e.g., `openocd`) |
| Flasher | Configured flasher found (if different from debugger) |
| Serial port | Configured serial port exists |
| API key | LLM API key environment variable is set |

Results are categorized:
- **✓** OK
- **⚠** Warning (feature will be limited)
- **✗** Fail (required component missing)

Doctor caches compiler versions to `.fwai/logs/doctor-cache.json` for use in project context injection.

---

## 16. Exit Codes

`fwai run` uses specific exit codes for CI integration:

| Code | Name | Description |
|------|------|-------------|
| **0** | Success | All tools completed successfully |
| **2** | Tool failure | One or more tools failed |
| **3** | CI guard rejected | Guarded tool (flash) requires `--yes` in CI mode |
| **4** | Budget exceeded | `git diff` exceeds change budget limits |
| **5** | Skill not found | Requested skill does not exist |
| **7** | Watchdog timeout | CI timeout exceeded (`max_total_duration_sec`) |

Usage in shell scripts:

```bash
fwai run bringup --ci --yes
rc=$?

case $rc in
  0) echo "All good" ;;
  2) echo "Tool failure — check evidence logs" ;;
  3) echo "Flash requires --yes flag" ;;
  4) echo "Change budget exceeded — split your patch" ;;
  5) echo "Skill not found" ;;
  7) echo "Timed out" ;;
esac
```

---

## 17. Troubleshooting

### "No .fwai/ workspace found"

Run `fwai init` in your project directory to create the workspace.

### "Skill not found: ..."

Check that the skill YAML exists in `.fwai/skills/` and the name matches. List available skills with `/skills` in the REPL or check the files directly.

### "Flash guard: no successful build found"

The flash guard requires a previous successful build in the evidence history. Run `/build` or `fwai run bringup` first.

### "LLM not configured"

Set the appropriate API key environment variable:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```
Tool commands work without an LLM. Only `llm_analyze` steps and free-form chat require it.

### Build/flash/monitor commands fail

1. Run `fwai doctor` to check your environment
2. Check the tool definition in `.fwai/tools/<name>.tool.yaml`
3. Verify the `command` works when run directly in your shell
4. Check log files in `.fwai/runs/<run-id>/`

### CI pipeline produces ANSI garbage

fwai auto-disables colors when stdout is not a TTY (piped). If you still see ANSI codes, use `--json` or `--quiet` for clean output. You can also set `logging.color: false` in `config.yaml`.

### Change budget blocks my build

In CI mode, exceeding the budget aborts with exit code 4. Options:
- Increase `policy.change_budget.max_files_changed` or `max_lines_changed`
- Split your changes into smaller patches (fwai suggests splits when budget is exceeded)
- In interactive mode, the build proceeds with a warning

### Boot pattern not detected

- Check `project.yaml` `boot.success_patterns` — these are regex patterns
- Ensure the monitor tool's `stop_conditions` includes `type: boot_patterns` with `inherit: true`
- Check the UART log in `.fwai/runs/<run-id>/uart.log` to see what was actually received
- If no pattern matches within the timeout, boot status is reported as `unknown`
