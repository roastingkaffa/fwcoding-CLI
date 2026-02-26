# Firmware AI CLI (fwai) — Product Specification

> Version: 1.2.0-draft
> Date: 2026-02-26
> Status: MVP Specification
> Changelog:
>   v1.2 — Added LLM Tracing in Evidence, CI Timeout Policy, Skill Confidence Mechanism
>   v1.1 — Added Hardware State Awareness, Boot Patterns, Project Context Injection, Smart Budget Splitting, Run Mode

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [CLI Interface](#4-cli-interface)
5. [Workspace Structure (.fwai/)](#5-workspace-structure-fwai)
6. [Configuration Schema](#6-configuration-schema)
7. [Tool Runtime](#7-tool-runtime)
8. [Evidence System](#8-evidence-system)
9. [Policy Engine](#9-policy-engine)
10. [Agent System](#10-agent-system)
11. [Skill System](#11-skill-system)
12. [LLM Provider Layer](#12-llm-provider-layer)
13. [Natural Language → Skill Resolution](#13-natural-language--skill-resolution)
14. [Project File Structure (fwai repo)](#14-project-file-structure-fwai-repo)
15. [Development Prompts (Build Sequence)](#15-development-prompts-build-sequence)
16. [Acceptance Criteria](#16-acceptance-criteria)
17. [Roadmap](#17-roadmap)

---

## 1. Product Vision

### 1.1 One-Liner

**fwai** is a CLI tool that brings AI-assisted development workflows to firmware engineering — with built-in safety guardrails, evidence traceability, and pluggable LLM backends.

### 1.2 Core Value Proposition

| Pain Point | fwai Solution |
|------------|---------------|
| Firmware build/flash/debug cycles are manual and error-prone | Automated workflows with evidence collection |
| No traceability for "what changed, why, what happened" | Every run produces `evidence.json` + logs + diffs |
| AI tools don't understand firmware safety constraints | Policy engine: protected paths, change budgets, flash guards |
| Different MCU toolchains require different setups | Pluggable tool definitions via YAML |
| LLM vendor lock-in | Provider abstraction layer (Anthropic / OpenAI / Gemini) |

### 1.3 Target Users

- Firmware engineers working on embedded projects (STM32, ESP32, nRF, RP2040, etc.)
- Teams that need auditable AI-assisted code changes
- CI/CD pipelines that need non-interactive `fwai run <skill>` execution

### 1.4 Design Principles

1. **Evidence-first**: No action is "done" without build/flash/boot logs
2. **Safety by default**: Protected paths, change budgets, flash confirmation
3. **Toolchain-agnostic**: Works with CMake, Make, west, idf.py, PlatformIO, Keil, IAR
4. **LLM-agnostic**: Pluggable providers, no vendor lock-in
5. **Progressive complexity**: Simple REPL first, agents/skills later
6. **Offline-capable core**: Tool execution works without LLM; LLM enhances but is not required

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Local Machine                      │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │              Firmware AI CLI (fwai)             │  │
│  │                                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │   REPL   │  │  Policy  │  │  Evidence    │  │  │
│  │  │  Router  │  │  Engine  │  │  Collector   │  │  │
│  │  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │  │
│  │       │              │               │         │  │
│  │  ┌────▼──────────────▼───────────────▼──────┐  │  │
│  │  │            Skill / Agent Runtime          │  │  │
│  │  └────────────────────┬─────────────────────┘  │  │
│  │                       │                        │  │
│  │  ┌────────────────────▼─────────────────────┐  │  │
│  │  │              Tool Runner                  │  │  │
│  │  │  build │ flash │ monitor │ diff │ doctor  │  │  │
│  │  └────────────────────┬─────────────────────┘  │  │
│  └───────────────────────┼────────────────────────┘  │
│                          │                           │
│    ┌─────────────────────▼──────────────────────┐    │
│    │         Firmware Toolchain (Host)           │    │
│    │  gcc-arm │ openocd │ jlink │ pyocd │ dfu   │    │
│    │  cmake   │ make    │ west  │ idf.py│ pio   │    │
│    └────────────────────────────────────────────┘    │
│                          │                           │
│              ┌───────────▼────────────┐              │
│              │   Target Hardware      │              │
│              │   (MCU / Dev Board)    │              │
│              └────────────────────────┘              │
└──────────────────────────────────────────────────────┘
                           │
                           │ HTTPS (API calls)
                           ▼
              ┌────────────────────────┐
              │      Cloud LLM         │
              │  Anthropic │ OpenAI    │
              │  Gemini    │ Local     │
              └────────────────────────┘
```

### 2.1 Data Flow

```
User Input ──→ REPL Router
                  │
                  ├─ /command ──→ Command Handler ──→ Tool Runner ──→ Evidence
                  │
                  └─ natural language ──→ Intent Resolver
                                             │
                                             ├─ keyword match ──→ Skill
                                             │
                                             └─ fallback ──→ LLM Provider
                                                               │
                                                               └──→ Skill / Direct Response
```

---

## 3. Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js 20+ | Broad ecosystem, good CLI tooling |
| Language | TypeScript 5.x | Type safety, better maintainability |
| CLI Framework | `commander` | Mature, well-documented |
| REPL | `readline` (MVP) | Zero dependency, upgrade to Ink TUI later |
| Config | `yaml` (npm) | Human-readable firmware configs |
| Serial | Shell wrapper (MVP) | Avoid native binding; use `picocom`/`minicom`/`screen` |
| Schema Validation | `zod` | Runtime validation with TypeScript inference |
| Build | `tsup` or `tsc` | Fast bundling |
| Package Manager | `npm` | Standard, no extra tooling |

### 3.1 Why NOT native serial (MVP)

`serialport` npm 套件需要 native build，會導致：
- 跨平台安裝問題（Windows/macOS/Linux）
- CI 環境需要 build tools
- `/dev/ttyUSB*` 權限需要 `dialout` group

**MVP 策略**：用 shell command wrapper（`picocom -b 115200 /dev/ttyUSB0`），穩定後再評估 native。

---

## 4. CLI Interface

### 4.1 Top-Level Commands

```bash
fwai init [--force]            # Initialize .fwai/ workspace
fwai                           # Enter interactive REPL
fwai run <skill> [args]        # Non-interactive skill execution (CI-friendly)
  --ci                         # CI mode: no interactive prompts, JSON output
  --yes                        # Auto-confirm destructive actions (flash)
fwai doctor                    # Check toolchain & environment health
fwai version                   # Show version info
```

### 4.2 REPL Commands

```
/help                      # List all commands
/build                     # Execute build tool, collect build.log
/flash                     # Execute flash tool, collect flash.log (with confirmation)
/monitor [duration]        # Capture UART output to uart.log
/evidence                  # List recent 5 runs summary
/agents                    # List configured agents
/skills                    # List available skills
/doctor                    # Check toolchain health
/config                    # Show current configuration
/exit                      # Exit REPL
```

**Non-command input**: Treated as natural language → routed through Intent Resolver.

### 4.3 Exit Codes (for CI)

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Build failed |
| 3 | Flash failed |
| 4 | Policy violation (change budget exceeded) |
| 5 | Configuration error |
| 6 | LLM provider error |
| 7 | CI timeout (max_total_duration_sec exceeded) |

---

## 5. Workspace Structure (.fwai/)

Generated by `fwai init` in target firmware repo:

```
.fwai/
├── .gitignore              # Exclude runs/ logs/ from version control
├── config.yaml             # Global CLI configuration
├── project.yaml            # Project-specific settings (target, serial, build system)
├── agents/                 # Agent role definitions
│   ├── bsp.agent.yaml
│   ├── driver.agent.yaml
│   ├── rtos.agent.yaml
│   └── release.agent.yaml
├── skills/                 # Workflow skill definitions
│   ├── bringup.skill.yaml
│   ├── build-fix.skill.yaml
│   └── diagnose.skill.yaml
├── tools/                  # Tool command definitions
│   ├── build.tool.yaml
│   ├── flash.tool.yaml
│   └── monitor.tool.yaml
├── mcp/                    # MCP server configs (future)
├── kb/                     # Knowledge base (datasheets, refs) (future)
├── runs/                   # Evidence runs (gitignored)
│   └── <timestamp>/
│       ├── plan.md
│       ├── diff.patch
│       ├── build.log
│       ├── flash.log
│       ├── uart.log
│       └── evidence.json
└── logs/                   # General logs (gitignored)
```

### 5.1 `.fwai/.gitignore`

```gitignore
# Auto-generated by fwai init
# Evidence runs and logs are local-only
runs/
logs/
*.log
```

---

## 6. Configuration Schema

### 6.1 `config.yaml` — Global Settings

```yaml
# .fwai/config.yaml
version: "1.0"

# LLM Provider
provider:
  name: anthropic                    # anthropic | openai | gemini | local
  model: claude-sonnet-4-20250514           # model identifier
  api_key_env: ANTHROPIC_API_KEY     # env var name (never store key directly)
  max_tokens: 4096
  temperature: 0.2

# Safety Policy
policy:
  protected_paths:
    - "boot/**"
    - "partition_table/**"
    - "*.ld"                         # linker scripts
    - "*.icf"                        # IAR linker configs
  change_budget:
    max_files_changed: 5
    max_lines_changed: 200
  flash_guard:
    require_confirmation: true       # Must confirm before flash
    require_build_success: true      # Must have passing build before flash
  require_evidence: true             # Run not complete without evidence

# Run Mode
mode:
  default: interactive               # interactive | ci
  # CI mode: no REPL, no interactive prompts, JSON output, strict exit codes
  # Override via CLI: fwai run <skill> --ci --yes
  ci:
    max_total_duration_sec: 600      # hard timeout for entire skill run (kills all)
    # Individual tool timeouts are still controlled by tool.yaml timeout_sec
    # Precedence: skill total timeout > tool timeout > no limit (interactive)

# Intent Resolution
intent:
  confidence_threshold_auto: 0.8     # auto-execute skill above this
  confidence_threshold_ask: 0.6      # ask user between ask..auto range
  # Below 0.6: treat as free-form conversation

# Logging
logging:
  level: info                        # debug | info | warn | error
  color: true                        # auto-disabled in CI mode
```

### 6.1.1 Run Mode Behavior

| Behavior | `interactive` | `ci` |
|----------|---------------|------|
| REPL | Enabled | Disabled (error if attempted) |
| Flash confirmation | Interactive prompt | Requires `--yes` flag |
| LLM interaction | Free-form allowed | Only skill-embedded prompts |
| Output format | Colored + tables | Plain text + JSON |
| Exit codes | Advisory | Strict (CI pipeline depends on them) |
| Tool timeout | Per-tool `timeout_sec` | Per-tool `timeout_sec` (enforced) |
| Skill timeout | None (waits for user) | `ci.max_total_duration_sec` hard kill |
| On timeout | Warning + continue | Kill process → exit code 7 |

**CLI override** (always takes priority over config):
```bash
fwai run bringup --ci --yes          # CI mode with auto-confirm
fwai run build-fix --ci              # CI mode, no flash so no --yes needed
fwai --interactive                   # Force interactive even if config says ci
```

### 6.2 `project.yaml` — Project Settings

```yaml
# .fwai/project.yaml
project:
  name: my-firmware-project
  description: "STM32F407 custom board firmware"

  # Target hardware
  target:
    mcu: STM32F407VG
    arch: arm-cortex-m4
    board: custom-board-v2
    flash_size: 512KB
    ram_size: 128KB

  # Build system
  build:
    system: cmake                    # cmake | make | west | idf.py | platformio | keil | iar
    build_dir: build
    source_dir: src
    entry_point: main.c              # or main.cpp

  # Serial / UART
  serial:
    port: /dev/ttyUSB0               # COM3 on Windows
    baud: 115200

  # Boot detection patterns (used by monitor + evidence)
  boot:
    success_patterns:
      - "System Ready"
      - "Boot complete"
      - "app_main: Starting"
    failure_patterns:
      - "PANIC"
      - "Hard Fault"
      - "WDT Reset"
      - "Stack overflow"
      - "Abort\\(\\)"

  # Toolchain (auto-detected by fwai doctor, can override)
  toolchain:
    compiler: arm-none-eabi-gcc
    debugger: openocd                # openocd | jlink | pyocd | stlink
    flasher: openocd                 # openocd | jlink | dfu-util | esptool
```

Boot patterns are **project-level** (not tool-level) because they describe device behavior, not tool configuration. The monitor tool and evidence system both reference these patterns.

### 6.3 Tool Definition — `tools/build.tool.yaml`

```yaml
# .fwai/tools/build.tool.yaml
name: build
description: "Compile firmware project"
command: "cmake --build build --parallel"
working_dir: "."                     # relative to repo root
timeout_sec: 120
success_patterns:
  - "Build complete"
  - "\\[100%\\]"
failure_patterns:
  - "error:"
  - "FAILED"
artifacts:
  - path: "build/*.bin"
    label: firmware_binary
  - path: "build/*.elf"
    label: firmware_elf
  - path: "build/*.map"
    label: memory_map
```

### 6.4 Tool Definition — `tools/flash.tool.yaml`

```yaml
# .fwai/tools/flash.tool.yaml
name: flash
description: "Flash firmware to target device"
command: "openocd -f board/stm32f4discovery.cfg -c 'program build/firmware.bin verify reset exit'"
working_dir: "."
timeout_sec: 60
requires:
  - build                            # must build first
guard:
  require_confirmation: true
  message: "About to flash target device. Continue?"
success_patterns:
  - "verified"
  - "Programming Finished"
failure_patterns:
  - "Error"
  - "Target not found"
```

### 6.5 Tool Definition — `tools/monitor.tool.yaml`

```yaml
# .fwai/tools/monitor.tool.yaml
name: monitor
description: "Capture UART output from target device"
command: "picocom -b ${baud} ${port} --logfile ${logfile}"
working_dir: "."
variables:
  port: "${project.serial.port}"
  baud: "${project.serial.baud}"
  logfile: "${run_dir}/uart.log"
stop_conditions:
  - type: timeout
    value: 30                        # seconds
  - type: boot_patterns              # inherit from project.yaml → boot.success_patterns / failure_patterns
    inherit: true                    # auto-reads project.boot patterns
  - type: match
    pattern: "System Ready"          # additional tool-specific patterns (merged with boot patterns)
  - type: match
    pattern: "PANIC"                 # stop on crash
    label: crash_detected
# MVP implementation:
#   - timeout + Ctrl+C: fully implemented
#   - boot_patterns (inherit): implemented (reads project.yaml, stops on match)
#   - match (custom): implemented alongside boot_patterns
```

---

## 7. Tool Runtime

### 7.1 Runner Lifecycle

```
Command Invoked (/build, /flash, /monitor)
    │
    ├─ 1. Create run directory: .fwai/runs/<ISO-timestamp>/
    │
    ├─ 2. Policy check (flash guard, change budget)
    │
    ├─ 3. Execute shell command (from tool.yaml)
    │     ├─ Capture stdout → <tool>.log
    │     ├─ Capture stderr → <tool>.log (merged)
    │     └─ Record exit code, duration
    │
    ├─ 4. Pattern matching (success/failure)
    │
    ├─ 5. Collect artifacts (if defined)
    │
    └─ 6. Write to evidence.json
```

### 7.2 Run Directory Naming

Format: `YYYYMMDD-HHmmss-<tool>` (e.g., `20260226-143052-build`)

When a skill runs multiple tools, they share one run directory:
`20260226-143052-bringup/` contains `build.log`, `flash.log`, `uart.log`.

### 7.3 Variable Interpolation

Tool YAML supports `${variable}` syntax:

| Variable | Source | Example |
|----------|--------|---------|
| `${project.serial.port}` | project.yaml | `/dev/ttyUSB0` |
| `${project.serial.baud}` | project.yaml | `115200` |
| `${project.build.build_dir}` | project.yaml | `build` |
| `${run_dir}` | Runtime | `.fwai/runs/20260226-143052-build` |
| `${timestamp}` | Runtime | `20260226-143052` |

---

## 8. Evidence System

### 8.1 `evidence.json` Schema

```typescript
interface Evidence {
  // Identification
  run_id: string;                    // ISO timestamp
  skill?: string;                    // skill name if run via skill

  // Timing
  start_time: string;                // ISO 8601
  end_time: string;                  // ISO 8601
  duration_ms: number;

  // Overall status
  status: "success" | "fail" | "partial" | "aborted";

  // Tool results (one per tool executed)
  tools: ToolResult[];

  // File changes (if any)
  changes?: {
    files_changed: number;
    lines_added: number;
    lines_removed: number;
    diff_path: string;               // relative path to diff.patch
    within_budget: boolean;
  };

  // Memory analysis (MVP+1, optional)
  memory?: {
    flash_used: number;              // bytes
    flash_total: number;
    ram_used: number;
    ram_total: number;
    flash_percent: number;
    ram_percent: number;
  };

  // Hardware state awareness (for Board Farm integration)
  hardware?: {
    serial_port: string;             // e.g. "/dev/ttyUSB0"
    debugger: string;                // e.g. "openocd"
    detected_device?: string;        // e.g. "STM32F407VG Rev 3" (from probe)
    flash_verified?: boolean;        // true if flash verify passed
    connection_type?: string;        // "usb" | "jtag" | "swd" | "uart"
  };

  // Boot detection result (from monitor + project.boot patterns)
  boot_status?: {
    status: "success" | "fail" | "unknown";
    matched_pattern?: string;        // which pattern triggered
    boot_time_ms?: number;           // time from reset to success pattern
  };

  // LLM usage tracing (audit / compliance / cost tracking)
  llm?: {
    provider: string;                // "anthropic" | "openai"
    model: string;                   // "claude-sonnet-4-20250514" | "gpt-4o"
    calls: LLMCallRecord[];          // every LLM call in this run
    total_input_tokens: number;
    total_output_tokens: number;
    estimated_cost_usd?: number;     // computed from token counts + model pricing
  };

  // Project context
  project: {
    name: string;
    target_mcu: string;
    arch: string;
    board?: string;
    flash_size?: string;
    ram_size?: string;
    git_branch?: string;
    git_commit?: string;
  };
}

interface LLMCallRecord {
  purpose: string;                   // "intent_resolution" | "llm_analyze" | "free_chat"
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  timestamp: string;                 // ISO 8601
}

interface ToolResult {
  tool: string;                      // "build" | "flash" | "monitor"
  command: string;                   // actual command executed
  exit_code: number;
  duration_ms: number;
  log_file: string;                  // relative path
  status: "success" | "fail";
  pattern_matched?: string;          // which success/failure pattern hit
  artifacts?: Artifact[];
}

interface Artifact {
  label: string;
  path: string;
  size_bytes: number;
}
```

### 8.2 `/evidence` Command Output

```
fwai> /evidence

Recent Runs:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#1  20260226-143052-bringup   SUCCESS   [build ✓ flash ✓ monitor ✓]  42.3s
#2  20260226-141200-build     FAIL      [build ✗]                     8.1s
#3  20260226-140015-build     SUCCESS   [build ✓]                     6.2s
#4  20260225-183000-flash     FAIL      [flash ✗ — Target not found]  3.0s
#5  20260225-175500-bringup   SUCCESS   [build ✓ flash ✓ monitor ✓]  38.7s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use /evidence <run-id> for details.
```

---

## 9. Policy Engine

### 9.1 Protected Paths

Files matching `protected_paths` globs **cannot be modified** by AI-suggested changes.

```yaml
protected_paths:
  - "boot/**"
  - "partition_table/**"
  - "*.ld"
  - "*.icf"
  - ".fwai/config.yaml"
```

**Enforcement**: Before applying any diff, check all affected files against protected paths. Reject if any match.

### 9.2 Change Budget

```yaml
change_budget:
  max_files_changed: 5
  max_lines_changed: 200
```

**Enforcement**: Parse `git diff --stat` output. If over budget:
1. Display warning with actual vs. allowed counts
2. Refuse to apply changes automatically
3. **Smart split suggestion** (two tiers):
   - **MVP**: Display file-by-file breakdown and suggest logical groupings
     ```
     ⚠ Change budget exceeded: 8 files (max 5), 312 lines (max 200)

     Breakdown:
       src/bsp/gpio.c        +45 -12
       src/bsp/clock.c       +38 -8
       src/bsp/uart.c        +22 -5
       src/drivers/spi.c     +61 -20
       src/drivers/i2c.c     +44 -15
       include/bsp/gpio.h    +18 -3
       include/bsp/clock.h   +12 -2
       config/board/pins.h   +30 -10

     Suggested split:
       Patch 1 (BSP): gpio.c, clock.c, uart.c, gpio.h, clock.h  (135 lines)
       Patch 2 (Drivers): spi.c, i2c.c                           (140 lines)
       Patch 3 (Config): pins.h                                   (40 lines)
     ```
   - **MVP+1**: Call LLM to analyze semantic dependencies and suggest optimal split

### 9.3 Flash Guard

```yaml
flash_guard:
  require_confirmation: true
  require_build_success: true
```

**Enforcement**:
1. Before `/flash`: check last build status in evidence. If failed → block.
2. **Interactive mode**: Display confirmation prompt: `⚠ Flash target [STM32F407VG] on [/dev/ttyUSB0]? (y/N)`
3. **CI mode**: Requires `--yes` flag to proceed. Without `--yes` → exit code 3 (flash failed).
4. Hardware info (serial port, debugger, detected device) is recorded in `evidence.json` → `hardware` field.

### 9.4 Rollback Rule

When changes involve **boot / flash / partition / clock / pinmux** files:
- Agent must include rollback steps in `plan.md`
- Evidence must record the rollback procedure

### 9.5 `fwai doctor` Checks

```
fwai doctor

Firmware AI CLI — Environment Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓  git                     2.43.0
  ✓  node                    20.11.0
  ✓  .fwai/                  found
  ✓  config.yaml             valid
  ✓  project.yaml            valid
  ✓  arm-none-eabi-gcc       12.3.0
  ✓  openocd                 0.12.0
  ✓  picocom                 3.1
  ✗  jlink                   not found (optional)
  ⚠  ANTHROPIC_API_KEY       not set (LLM features disabled)
  ✓  /dev/ttyUSB0            accessible

Overall: READY (1 warning, 1 optional missing)
```

**Doctor checks**:
1. `git` available and current dir is a repo
2. `.fwai/` exists and configs are valid (zod validation)
3. Toolchain binaries from `project.yaml` are on PATH
4. Serial port exists and is accessible
5. LLM API key env var is set
6. Build directory exists (if configured)

---

## 10. Agent System

### 10.1 Design (MVP: Single Agent + Role Templates)

MVP does **not** implement multi-agent concurrency. Instead:
- One active agent at a time
- Agent selection via `/agents use <name>` or auto-selection by skill
- Each agent has its own system prompt and path restrictions

### 10.2 Agent Schema

```yaml
# .fwai/agents/bsp.agent.yaml
name: bsp
description: "Board Support Package specialist"
model: inherit                       # inherit from config.yaml, or override
system_prompt: |
  You are a BSP (Board Support Package) firmware engineer.
  You specialize in hardware abstraction layers, peripheral initialization,
  clock configuration, and pin multiplexing.

  Rules:
  1. Always propose a plan before making changes
  2. Changes must not exceed the change budget
  3. Must produce evidence (build + flash + boot log)
  4. For boot/clock/pinmux changes, include rollback steps
  5. Never modify protected paths
allowed_paths:
  - "src/bsp/**"
  - "src/hal/**"
  - "include/bsp/**"
  - "config/board/**"
protected_paths:
  - "boot/**"
  - "*.ld"
```

### 10.3 Default Agents

| Agent | Domain | Allowed Paths |
|-------|--------|--------------|
| `bsp` | Board support, HAL, peripherals | `src/bsp/**`, `src/hal/**` |
| `driver` | Device drivers | `src/drivers/**` |
| `rtos` | RTOS config, tasks, scheduling | `src/rtos/**`, `src/tasks/**` |
| `release` | Build config, versioning, release | `CMakeLists.txt`, `version.h`, `Makefile` |

### 10.4 Agent Interface (TypeScript)

```typescript
interface AgentConfig {
  name: string;
  description: string;
  model: string | "inherit";
  system_prompt: string;
  allowed_paths: string[];
  protected_paths?: string[];
  tools?: string[];                  // which tools this agent can invoke
}
```

---

## 11. Skill System

### 11.1 Skill Schema

```yaml
# .fwai/skills/bringup.skill.yaml
name: bringup
description: "Full board bring-up: build → flash → monitor → evidence"
agent: bsp                           # which agent to use (optional)
steps:
  - tool: build
    on_fail: abort                   # abort | continue | retry
  - tool: flash
    on_fail: abort
  - tool: monitor
    config:
      timeout_sec: 15
    on_fail: continue                # monitor failure is non-fatal
  - action: evidence
    summary: true                    # print summary after completion
triggers:                            # natural language trigger keywords
  - bringup
  - bring-up
  - "board bring up"
  - "build and flash"
  - "full test"
```

### 11.2 More Skill Examples

```yaml
# .fwai/skills/build-fix.skill.yaml
name: build-fix
description: "Build, analyze errors with LLM, suggest fixes"
steps:
  - tool: build
    on_fail: continue                # continue to analysis even if build fails
  - action: llm_analyze
    input: "${run_dir}/build.log"
    prompt: |
      Analyze this firmware build log. Identify the root cause of errors.
      Suggest specific fixes with file paths and line numbers.
      Consider the target MCU: ${project.target.mcu}
  - action: evidence
triggers:
  - "fix build"
  - "build error"
  - "why won't it compile"
```

```yaml
# .fwai/skills/diagnose.skill.yaml
name: diagnose
description: "Capture UART output and diagnose boot issues with LLM"
steps:
  - tool: monitor
    config:
      timeout_sec: 20
    on_fail: continue
  - action: llm_analyze
    input: "${run_dir}/uart.log"
    prompt: |
      Analyze this UART boot log from a ${project.target.mcu} device.
      Identify any errors, crashes, or unexpected behavior.
      Suggest debugging steps.
  - action: evidence
triggers:
  - diagnose
  - "boot issue"
  - "uart error"
  - "crash"
  - "hard fault"
```

### 11.3 Skill Interface (TypeScript)

```typescript
interface SkillConfig {
  name: string;
  description: string;
  agent?: string;
  steps: SkillStep[];
  triggers?: string[];
}

type SkillStep =
  | { tool: string; on_fail: "abort" | "continue" | "retry"; config?: Record<string, unknown> }
  | { action: "evidence"; summary?: boolean }
  | { action: "llm_analyze"; input: string; prompt: string };
```

---

## 12. LLM Provider Layer

### 12.1 Provider Interface

```typescript
interface LLMProvider {
  name: string;

  /** Initialize provider, validate API key */
  init(config: ProviderConfig): Promise<void>;

  /** Send messages, get completion */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /** Check if provider is configured and ready */
  isReady(): boolean;

  /** Get provider status info */
  status(): ProviderStatus;
}

interface CompletionRequest {
  messages: Message[];
  system?: string;
  max_tokens?: number;
  temperature?: number;
  // tool_use reserved for future
}

interface CompletionResponse {
  content: string;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ProviderConfig {
  name: string;
  model: string;
  api_key_env: string;
  max_tokens: number;
  temperature: number;
}
```

### 12.2 MVP Providers

| Provider | Model | API Key Env |
|----------|-------|-------------|
| `anthropic` | claude-sonnet-4-20250514 | `ANTHROPIC_API_KEY` |
| `openai` | gpt-4o | `OPENAI_API_KEY` |

### 12.3 Provider Selection

```yaml
# .fwai/config.yaml
provider:
  name: anthropic
  model: claude-sonnet-4-20250514
  api_key_env: ANTHROPIC_API_KEY
```

When API key is not set:
```
fwai> hello
⚠ LLM not configured. Set ANTHROPIC_API_KEY or run /config to change provider.
  Tool commands (/build, /flash, /monitor) still work without LLM.
```

---

## 12.4 Automatic Project Context Injection

Every LLM call (both free-form conversation and `llm_analyze` skill steps) automatically prepends a **Project Context Block** to the system prompt. Skill authors do NOT need to manually include `${project.target.mcu}` — it's injected by the runtime.

**Context Block Template:**

```
## Firmware Project Context (auto-injected)
- Project: {{project.name}}
- MCU: {{project.target.mcu}}
- Architecture: {{project.target.arch}}
- Board: {{project.target.board}}
- Flash: {{project.target.flash_size}} | RAM: {{project.target.ram_size}}
- Build System: {{project.build.system}}
- Compiler: {{project.toolchain.compiler}} {{compiler_version}}
- Debugger: {{project.toolchain.debugger}}
```

**`compiler_version`** is detected at runtime by `fwai doctor` (e.g., `arm-none-eabi-gcc --version`) and cached in `.fwai/logs/doctor-cache.json`.

**TypeScript Interface:**

```typescript
interface ProjectContext {
  name: string;
  mcu: string;
  arch: string;
  board?: string;
  flash_size?: string;
  ram_size?: string;
  compiler: string;
  compiler_version?: string;         // auto-detected, cached
  build_system: string;
  debugger?: string;
}
```

**Why auto-inject?**
- LLM 分析 build error 時知道是 ARM Cortex-M4 還是 RISC-V，建議完全不同
- 避免 skill 作者每次手動寫 `Consider the target MCU: ${project.target.mcu}`
- 確保每個 LLM 互動都有一致的硬體上下文

---

## 13. Natural Language → Skill Resolution

### 13.1 Three-Tier Resolution

```
User Input: "幫我做一次 bringup"
    │
    ├─ Tier 1: Exact command match
    │   └─ /bringup → NO (no leading /)
    │
    ├─ Tier 2: Keyword trigger match (confidence: 1.0)
    │   └─ "bringup" matches bringup.skill.yaml triggers → YES ✓
    │   └─ Execute skill directly
    │
    └─ Tier 3: LLM classification with confidence (fallback)
        └─ Send to LLM with structured prompt
        └─ Parse response: skill_name|confidence (e.g. "bringup|0.87")
        │
        ├─ confidence >= 0.8 → Execute skill directly
        ├─ 0.6 <= confidence < 0.8 → Ask user to confirm
        │     "Did you mean: run 'bringup' skill? (y/N)"
        ├─ confidence < 0.6 → Treat as free-form conversation
        └─ Parse failure → confidence = 0 (safe fallback)
```

### 13.2 Keyword Matching Rules

1. Case-insensitive
2. Match against `triggers[]` in skill YAML
3. Partial match allowed (e.g., "build" matches "fix build" trigger)
4. If multiple skills match, pick the one with the longest matching trigger
5. Keyword matches always have `confidence: 1.0` (no confirmation needed)

### 13.3 Confidence Configuration

```yaml
# .fwai/config.yaml (optional, has sensible defaults)
intent:
  confidence_threshold_auto: 0.8     # auto-execute skill above this
  confidence_threshold_ask: 0.6      # ask user between ask..auto range
  # Below 0.6: treat as free-form conversation
```

**CI mode override**: In CI mode, confidence < 0.8 → skip skill (no user to ask). Log to evidence.

### 13.4 LLM Classification Prompt (Tier 3)

```
You are a firmware development assistant. Given the user's request,
determine which skill to execute. Available skills:

{{#each skills}}
- {{name}}: {{description}} (triggers: {{triggers}})
{{/each}}

User request: "{{user_input}}"

Respond in this exact format (no other text):
SKILL_NAME|CONFIDENCE

Where CONFIDENCE is a number between 0.0 and 1.0 indicating how sure you are.
If no skill matches, respond with: none|0.0

Examples:
- "build and flash my board" → bringup|0.92
- "help me fix compile errors" → build-fix|0.85
- "what is the weather" → none|0.0
- "maybe do a bringup?" → bringup|0.65
```

### 13.5 Confidence Parsing (TypeScript)

```typescript
interface IntentResult {
  skill: string | null;
  confidence: number;                // 0.0 - 1.0
  source: "exact" | "keyword" | "llm";
  raw_response?: string;            // original LLM output (for debugging)
}

function parseIntentResponse(raw: string): IntentResult {
  const match = raw.trim().match(/^(\w[\w-]*)\|(\d+\.?\d*)$/);
  if (!match) {
    return { skill: null, confidence: 0, source: "llm", raw_response: raw };
  }
  const [, skill, conf] = match;
  const confidence = Math.min(1, Math.max(0, parseFloat(conf)));
  return {
    skill: skill === "none" ? null : skill,
    confidence,
    source: "llm",
    raw_response: raw,
  };
}
```

### 13.6 Intent Resolution in Evidence

Every intent resolution is recorded in `evidence.json` → `llm.calls[]`:

```json
{
  "purpose": "intent_resolution",
  "model": "claude-sonnet-4-20250514",
  "input_tokens": 142,
  "output_tokens": 8,
  "duration_ms": 320,
  "timestamp": "2026-02-26T14:30:52Z",
  "metadata": {
    "user_input": "幫我做一次 bringup",
    "resolved_skill": "bringup",
    "confidence": 0.87,
    "source": "keyword"
  }
}
```

---

## 14. Project File Structure (fwai repo)

```
fwai/
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── cli.ts                       # Entry point: fwai init/doctor/run/version
│   ├── repl.ts                      # Interactive REPL loop
│   │
│   ├── commands/                    # REPL command handlers
│   │   ├── index.ts                 # Command registry & router
│   │   ├── help.ts
│   │   ├── build.ts
│   │   ├── flash.ts
│   │   ├── monitor.ts
│   │   ├── evidence.ts
│   │   ├── agents.ts
│   │   ├── skills.ts
│   │   ├── config.ts
│   │   └── doctor.ts
│   │
│   ├── core/
│   │   ├── workspace.ts             # .fwai/ init, load, validate
│   │   ├── policy.ts                # Protected paths, change budget, flash guard
│   │   ├── runner.ts                # Shell command execution, log capture
│   │   ├── evidence.ts              # Run directory management, evidence.json
│   │   ├── diff.ts                  # Git diff/patch generation
│   │   └── config-loader.ts         # YAML loading with zod validation
│   │
│   ├── agents/
│   │   ├── agent-loader.ts          # Load agent YAML configs
│   │   └── agent-runtime.ts         # Agent context & prompt assembly
│   │
│   ├── skills/
│   │   ├── skill-loader.ts          # Load skill YAML configs
│   │   ├── skill-runner.ts          # Execute skill step sequences
│   │   └── intent-resolver.ts       # NL → skill matching (keyword + LLM)
│   │
│   ├── providers/
│   │   ├── provider.ts              # LLMProvider interface
│   │   ├── provider-factory.ts      # Create provider by name
│   │   ├── anthropic.ts             # Anthropic Claude implementation
│   │   └── openai.ts                # OpenAI GPT implementation
│   │
│   ├── schemas/
│   │   ├── config.schema.ts         # Zod schema for config.yaml
│   │   ├── project.schema.ts        # Zod schema for project.yaml
│   │   ├── agent.schema.ts          # Zod schema for agent YAML
│   │   ├── skill.schema.ts          # Zod schema for skill YAML
│   │   ├── tool.schema.ts           # Zod schema for tool YAML
│   │   └── evidence.schema.ts       # Zod schema for evidence.json
│   │
│   └── utils/
│       ├── logger.ts                # Console output formatting
│       ├── paths.ts                 # Path resolution helpers
│       ├── interpolate.ts           # ${variable} template interpolation
│       ├── project-context.ts       # Auto-inject project context for LLM calls
│       ├── run-mode.ts              # Interactive vs CI mode resolution
│       └── llm-tracer.ts            # LLM call recording for evidence
│
├── templates/                       # Used by `fwai init`
│   └── .fwai/
│       ├── .gitignore
│       ├── config.yaml
│       ├── project.yaml
│       ├── agents/
│       │   ├── bsp.agent.yaml
│       │   ├── driver.agent.yaml
│       │   ├── rtos.agent.yaml
│       │   └── release.agent.yaml
│       ├── skills/
│       │   ├── bringup.skill.yaml
│       │   ├── build-fix.skill.yaml
│       │   └── diagnose.skill.yaml
│       └── tools/
│           ├── build.tool.yaml
│           ├── flash.tool.yaml
│           └── monitor.tool.yaml
│
└── tests/
    ├── workspace.test.ts
    ├── policy.test.ts
    ├── runner.test.ts
    ├── evidence.test.ts
    ├── skill-runner.test.ts
    ├── intent-resolver.test.ts
    └── fixtures/
        ├── mock-build-output.txt
        ├── mock-flash-output.txt
        └── mock-uart-output.txt
```

---

## 15. Development Prompts (Build Sequence)

### Prompt 0 — Project Scaffold

```
你是我的 principal engineer。請在此 repo 內建立專案「fwai」：Firmware AI CLI。
目標：做出可安裝的 CLI，提供 `fwai init`, `fwai`, `fwai run <skill>`, `fwai doctor`。

技術棧：Node.js 20 + TypeScript + commander + readline + yaml + zod

請先產出完整 TypeScript 專案骨架（package.json / tsconfig / src/ 所有檔案），
確保 `npm install && npm run build` 可以成功。

每個 src/ 檔案先寫好 export 的函數簽名和 TODO 註解即可（不用完整實作）。
重點是整體結構正確、TypeScript 編譯通過。

不要產出 README（已有 spec）。
完成後列出下一步 TODO checklist。
```

### Prompt 1 — Workspace Init

```
請實作 `fwai init`：
- 在目前目錄建立 `.fwai/`，從 `templates/.fwai/` 複製完整結構
- 若 `.fwai/` 已存在，提示並退出（除非 --force）
- 產生 `.fwai/.gitignore`（排除 runs/ logs/）
- 產生 config.yaml、project.yaml、agents/、skills/、tools/ 的範例檔案
- 使用 zod 驗證生成的 config

templates 內容參照 spec 的 Section 6（Configuration Schema）。
完成後示範：執行 `node dist/cli.js init` 的輸出與產生的檔案結構。
```

### Prompt 2 — REPL + Command Router

```
請實作 `fwai` 互動模式（REPL）：
- 啟動後檢查 .fwai/ 是否存在（不存在則提示執行 fwai init）
- 顯示提示符 `fwai> `
- 支援指令：/help /build /flash /monitor /evidence /agents /skills /config /doctor /exit
- `/` 開頭 → 指令路由；非 `/` → 先印出「Natural language processing not yet enabled」
- /help 顯示所有可用指令與說明
- 支援 Ctrl+C 優雅退出

先把路由架構做完整，每個 command handler 先印 placeholder 訊息。
```

### Prompt 3 — Tool Runner

```
請實作 Tool Runner（src/core/runner.ts）：
- 讀取 `.fwai/tools/*.tool.yaml` 的定義
- 執行 shell command，capture stdout+stderr 合併寫入 log 檔
- 支援 ${variable} 插值（從 project.yaml + runtime 變數）
- 支援 timeout_sec（超時殺 process）
- 回傳 ToolResult（exit_code, duration_ms, log_path, matched_pattern）

接上 /build /flash /monitor 指令：
- /build：執行 build tool，產生 .fwai/runs/<ts>/build.log
- /flash：先檢查 flash guard（policy），需要 user 確認；記錄 hardware 資訊到 evidence
- /monitor：執行 monitor tool，支援：
  - timeout 秒後停止 + Ctrl+C 中斷
  - 讀取 project.yaml 的 boot.success_patterns / failure_patterns
  - 即時比對 UART 輸出，匹配到 pattern 時停止並記錄 boot_status
- 記錄 hardware state（serial_port, debugger, connection_type）到 evidence

支援 Run Mode（interactive vs ci）：
- CI 模式下 flash 需要 --yes flag，否則 exit code 3
- CI 模式下無 color output

每次執行自動建立 run 目錄。
```

### Prompt 4 — Evidence System

```
請實作 Evidence 系統（src/core/evidence.ts）：
- 每次 run 建立 `.fwai/runs/<YYYYMMDD-HHmmss-tool>/`
- 寫入 evidence.json，schema 參照 spec Section 8，包含：
  - hardware state（serial_port, debugger, detected_device, flash_verified, connection_type）
  - boot_status（status, matched_pattern, boot_time_ms）
  - 擴充的 project context（含 arch, board, flash_size, ram_size）
- 用 zod 定義 Evidence TypeScript type
- 若有檔案變更，生成 diff.patch（git diff）
- /evidence 指令：列出最近 5 次 runs 的摘要表格
- /evidence <run-id> 指令：顯示單次 run 的詳細資訊（含 hardware + boot status）

確保 build/flash/monitor 完成後都正確寫入 evidence。
hardware 資訊從 project.yaml 讀取，detected_device 由 flash tool 輸出解析。
```

### Prompt 5 — Policy Engine + Doctor

```
請實作 Policy Engine（src/core/policy.ts）：
- 讀取 .fwai/config.yaml 的 policy 區段
- protected_paths：檢查路徑列表，拒絕修改受保護檔案
- change_budget：解析 git diff --stat，檢查是否超出預算
  - 超出時：顯示 file-by-file breakdown
  - 按目錄/模組自動分組，建議拆分方案（e.g. Patch 1: BSP files, Patch 2: Driver files）
  - 顯示每個 patch 的預估行數，確保每個都在 budget 內
- flash_guard：/flash 前檢查最近一次 build 是否成功

支援 Run Mode：
- CI 模式下 budget 超出 → 直接 exit code 4，不互動

實作 `fwai doctor`（src/commands/doctor.ts）：
- 檢查：git 可用性、是否在 repo 內、.fwai/ 存在、config/project.yaml 有效
- 檢查：toolchain binaries（從 project.yaml 讀取）是否在 PATH
- 偵測 compiler version（e.g. arm-none-eabi-gcc --version）並快取到 .fwai/logs/doctor-cache.json
- 檢查：serial port 是否存在
- 檢查：LLM API key env var 是否設定
- 輸出格式化結果（✓ / ✗ / ⚠）
```

### Prompt 6 — LLM Provider

```
請實作 LLM Provider 抽象層：
- src/providers/provider.ts：LLMProvider interface（參照 spec Section 12）
  - complete() 必須回傳 token usage（input_tokens, output_tokens）
- src/providers/anthropic.ts：用 @anthropic-ai/sdk，從環境變數讀 API key
- src/providers/openai.ts：用 openai SDK，從環境變數讀 API key
- src/providers/provider-factory.ts：根據 config.yaml 的 provider.name 建立實例

LLM Call Tracing（每次呼叫都記錄）：
- 建立 LLMCallRecord（purpose, model, tokens, duration, timestamp）
- 累積到當前 run 的 evidence.llm 欄位
- 記錄 estimated_cost_usd（根據 model 定價計算）

Project Context 自動注入（src/utils/project-context.ts）：
- 從 project.yaml 組裝 ProjectContext 物件
- 從 doctor-cache.json 讀取 compiler_version
- 每次 LLM call 自動 prepend 到 system prompt（參照 spec Section 12.4）
- Skill 的 llm_analyze prompt 不需要手動寫 ${project.target.mcu}，runtime 自動注入

REPL 整合：
- 啟動時初始化 provider（如果 API key 存在）
- 非 / 開頭的輸入 → 送給 LLM，回覆印在 REPL
- System prompt = Project Context Block + agent 的 system_prompt
- 未設定 key 時顯示提示，但不阻塞 tool 指令的使用

CI Timeout 支援：
- 讀取 config.yaml 的 ci.max_total_duration_sec
- 設定 skill 級別的 watchdog timer
- 超時 → kill 所有子 process → exit code 7
```

### Prompt 7 — Skill Runner + Natural Language

```
請實作 Skill 系統：
- src/skills/skill-loader.ts：載入 .fwai/skills/*.skill.yaml
- src/skills/skill-runner.ts：依序執行 skill 的 steps
  - tool step → 呼叫 Tool Runner
  - llm_analyze step → 讀取 log 檔，送給 LLM 分析（記錄 LLMCallRecord）
  - evidence step → 產生 evidence.json（含 llm tracing）
  - 根據 on_fail 決定 abort/continue
  - CI 模式：遵守 max_total_duration_sec 總時限

- src/skills/intent-resolver.ts：三層解析 + 信心度機制（參照 spec Section 13）
  - Tier 1: exact command match → confidence 1.0
  - Tier 2: keyword trigger match → confidence 1.0
  - Tier 3: LLM classification → parse "skill|confidence" 格式
    - >= 0.8 → 自動執行
    - 0.6~0.8 → 詢問使用者確認（interactive）/ 跳過（CI）
    - < 0.6 → 當作自由對話
    - Parse 失敗 → confidence 0（安全 fallback）
  - 閾值可在 config.yaml 的 intent 區段配置
  - 每次 intent resolution 記錄到 evidence.llm.calls[]

整合到 REPL：
- 非 / 輸入 → intent-resolver → 根據 confidence 決定行為
- `fwai run <skill>` → 非互動模式直接執行 skill（跳過 intent resolution）
- 示範：完整跑一次 bringup skill（可用 mock commands）
- 示範：低信心度觸發確認流程
```

---

## 16. Acceptance Criteria

### 16.1 MVP Must-Pass

| # | Test | Pass Criteria |
|---|------|---------------|
| 1 | `fwai init` | `.fwai/` 完整結構生成，含 .gitignore |
| 2 | `fwai init` (existing) | 提示已存在並退出 |
| 3 | `fwai init --force` | 覆蓋已有的 .fwai/ |
| 4 | `fwai` | 進入 REPL，顯示 `fwai>` 提示符 |
| 5 | `/help` | 顯示所有可用指令 |
| 6 | `/build` | 執行 build command，產生 `runs/.../build.log` |
| 7 | `/flash` | 顯示確認提示，確認後執行，產生 `flash.log` |
| 8 | `/monitor` | 收集 UART N 秒，產生 `uart.log` |
| 9 | `/evidence` | 列出最近 5 次 runs 摘要 |
| 10 | evidence.json | 包含 run_id, status, tools[], timing |
| 11 | Change budget | 超出預算時拒絕並提示 |
| 12 | Protected paths | 嘗試修改受保護路徑時拒絕 |
| 13 | Flash guard | 沒有成功 build 時拒絕 flash |
| 14 | `fwai doctor` | 正確檢測 git/toolchain/serial/API key |
| 15 | `fwai run bringup` | 依序執行 build→flash→monitor→evidence |
| 16 | LLM basic | 自然語言送出、收到回覆、印在 REPL |
| 17 | NL→Skill | 「幫我做 bringup」觸發 bringup skill |
| 18 | No LLM fallback | 無 API key 時 tool 指令仍可正常使用 |
| 19 | Hardware state | evidence.json 包含 hardware 欄位（serial_port, debugger） |
| 20 | Boot detection | monitor 根據 project.boot.success_patterns 判斷 boot_status |
| 21 | Project context | LLM call 自動注入 MCU/arch/compiler 上下文 |
| 22 | Budget split | 超出 change budget 時顯示 file breakdown + 拆分建議 |
| 23 | CI mode | `fwai run bringup --ci --yes` 無互動完成全流程 |
| 24 | CI no-yes guard | `fwai run bringup --ci`（無 --yes）在 flash 時 exit code 3 |
| 25 | LLM tracing | evidence.json 包含 llm 欄位（provider, model, calls[], token counts） |
| 26 | CI timeout | `ci.max_total_duration_sec` 超時 → kill + exit code 7 |
| 27 | Confidence high | 「幫我 bringup」→ confidence >= 0.8 → 自動執行 |
| 28 | Confidence mid | 模糊輸入 → 0.6~0.8 → 詢問確認 |
| 29 | Confidence low | 無關輸入 → < 0.6 → 當自由對話 |
| 30 | Confidence CI | CI 模式 confidence < 0.8 → 跳過 skill，不卡住 |

### 16.2 Can Use Mocks

- Build: `echo "Build complete" && exit 0`
- Flash: `echo "Programming Finished. Verified." && exit 0`
- Monitor: `echo "Booting...\nInit HAL...\nSystem Ready" && sleep 5`
- Serial: mock file or loopback

---

## 17. Roadmap

### Phase 1 — MVP (Current)

- [x] Spec finalized (v1.1 with community feedback)
- [ ] Project scaffold (Prompt 0)
- [ ] Workspace init (Prompt 1)
- [ ] REPL + routing (Prompt 2)
- [ ] Tool runner + boot pattern matching + hardware state (Prompt 3)
- [ ] Evidence system + hardware/boot_status fields (Prompt 4)
- [ ] Policy engine + smart budget split + doctor w/ compiler cache (Prompt 5)
- [ ] LLM provider + auto project context injection + LLM tracing (Prompt 6)
- [ ] Skill runner + NL + confidence mechanism (Prompt 7)
- [ ] CI/interactive run mode + CI timeout support (across Prompts 3-7)

### Phase 2 — MVP+1

- [ ] Memory/ROM analysis (parse .map / arm-none-eabi-size)
- [ ] LLM-powered smart patch splitting (upgrade from directory-based grouping)
- [ ] Ink TUI upgrade (replace readline)
- [ ] Multi-provider hot-switch (`/provider openai`)
- [ ] Streaming LLM output in REPL
- [ ] Tool-calling protocol (LLM can invoke tools)
- [ ] Board Farm integration (leverage hardware state in evidence)

### Phase 3 — Internal Release

- [ ] Knowledge Base (`kb/`) with local RAG
- [ ] MCP server integration
- [ ] Multi-agent concurrency
- [ ] CI/CD integration guide (GitHub Actions / GitLab CI)
- [ ] VS Code extension

### Phase 4 — Commercial

- [ ] Plugin marketplace (community tools/skills/agents)
- [ ] Team license & cloud dashboard
- [ ] Audit trail / compliance export
- [ ] OTA update workflow
- [ ] GDB/debug integration

---

> **Next Step**: Review this spec, confirm or adjust, then start Prompt 0 to build the project scaffold.
