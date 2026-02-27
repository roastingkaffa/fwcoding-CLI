# fwai User Manual

> Firmware AI CLI — AI-assisted firmware development with safety guardrails and evidence traceability.

## Getting Started

### Installation

```bash
npm install -g fwai
```

### Initialize a Project

```bash
cd your-firmware-project
fwai init
```

This creates a `.fwai/` directory with default configuration files:
- `config.yaml` — LLM provider, policy, logging settings
- `project.yaml` — MCU target, build system, serial port
- `tools/` — Build, flash, monitor tool definitions
- `skills/` — Bringup, build-fix, diagnose workflows
- `agents/` — BSP, driver, RTOS, release agent configs

### Start the REPL

```bash
fwai
```

## REPL Commands

| Command | Description |
|---------|-------------|
| `/help` | List all commands |
| `/build` | Execute build tool, collect build.log |
| `/flash` | Flash firmware to target (with confirmation) |
| `/monitor` | Capture UART output to uart.log |
| `/evidence` | List recent runs or show run details |
| `/agents` | List configured agents |
| `/skills` | List available skills |
| `/config` | Show current configuration |
| `/doctor` | Check toolchain & environment health |
| `/agent <name>` | Start scoped agent chat (e.g., `/agent bsp`) |
| `/memory [elf]` | Analyze firmware memory/ROM usage |
| `/provider [name]` | Show or switch LLM provider |
| `/farm list\|allocate\|release` | Board farm management |
| `/exit` | Exit REPL |

Type natural language to interact with the AI assistant directly.

### Tab Completion

Press `Tab` after typing `/` to see and auto-complete available commands. For example, typing `/bu` then `Tab` completes to `/build`.

### Spinner Feedback

During LLM calls and tool execution, a spinner is displayed to indicate progress. The spinner automatically pauses when log output is written and clears before streaming text begins. Spinners are disabled automatically in non-TTY environments (CI).

## Agentic Mode

### What is Agentic Mode?

fwai supports an agentic loop where the LLM can autonomously call tools (read files, write files, run commands, search code) to accomplish tasks. The loop continues until the LLM decides it's done or hits the iteration limit.

### Using /agent

Start a scoped agent chat:

```
fwai> /agent bsp
```

This launches the BSP agent with:
- **Scoped paths**: Only files in `src/bsp/**`, `src/hal/**`, etc.
- **Scoped tools**: Only the tools listed in the agent config
- **Custom system prompt**: Agent-specific expertise and rules
- **Protected paths**: Files the agent cannot modify

### Built-in Agentic Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with optional line range |
| `write_file` | Create or overwrite a file |
| `edit_file` | Replace exact text in a file |
| `bash` | Execute shell commands |
| `grep` | Search file contents with regex |
| `glob` | Find files by pattern |
| `memory_analysis` | Analyze ELF binary memory usage |

## Agentic Skills

Skills can mix fixed steps (deterministic tool execution) with agentic steps (LLM-driven autonomous execution).

### Example: Smart Bringup

```yaml
name: smart-bringup
steps:
  - tool: build              # Fixed: run build
    on_fail: continue
  - action: agentic           # Agentic: AI analyzes & fixes errors
    goal: "Read build log, fix errors, rebuild"
    agent: bsp
    max_iterations: 10
  - tool: flash               # Fixed: flash firmware
    on_fail: abort
  - tool: monitor             # Fixed: monitor boot
  - action: evidence          # Fixed: generate evidence
    summary: true
```

## Tool-Calling

When the LLM provider supports tool-calling (e.g., Anthropic Claude), fwai uses structured tool invocations instead of text-based commands. The agentic loop:

1. Sends user message + tool definitions to LLM
2. LLM responds with `tool_use` blocks
3. fwai executes each tool
4. Results are sent back to LLM
5. Repeat until LLM sends `end_turn`

All tool calls are tracked in evidence for auditability.

## Memory Analysis (/memory)

Analyze firmware Flash and RAM usage:

```
fwai> /memory build/firmware.elf
```

Output:
```
┌──────────┬────────────┬────────────┬─────────┐
│ Region   │ Used       │ Total      │ Usage   │
├──────────┼────────────┼────────────┼─────────┤
│ Flash    │ 25.0 KB    │ 512.0 KB   │   4.9%  │
│ RAM      │ 3.0 KB     │ 128.0 KB   │   2.3%  │
└──────────┴────────────┴────────────┴─────────┘
```

Requires `arm-none-eabi-size` in PATH. Reads `flash_size` and `ram_size` from `project.yaml`.

## Provider Switching (/provider)

Hot-switch between LLM providers without restarting:

```
fwai> /provider                    # Show current status
fwai> /provider anthropic          # Switch to Anthropic (default model)
fwai> /provider openai gpt-4o      # Switch to OpenAI with specific model
```

Supported providers: `anthropic`, `openai`, `gemini`, `local`

## Knowledge Base

Place `.md` or `.txt` files in `.fwai/kb/` to provide project-specific context to the AI:

```
.fwai/kb/
├── stm32f4-notes.md
├── coding-standards.md
└── hardware-quirks.txt
```

When you ask a question, fwai searches the KB by keywords and injects relevant documents into the system prompt. This gives the AI access to project-specific knowledge without embeddings or external services.

### Configuration

```yaml
# .fwai/config.yaml
kb:
  enabled: true
  max_context_tokens: 4000
  include: ["**/*.md", "**/*.txt"]
  exclude: ["drafts/**"]
```

## Board Farm

The board farm feature provides an interface for managing remote hardware boards:

```
fwai> /farm list               # List available boards
fwai> /farm allocate board-01  # Allocate a board
fwai> /farm release board-01   # Release a board
```

> **Note**: Board farm is currently a stub implementation. Configure `board_farm` in `config.yaml` when a farm backend is available.

## Evidence System

Every skill run produces an `evidence.json` file with:
- Tool results (exit codes, logs, durations)
- LLM call records (tokens, cost, timing)
- Hardware state (serial port, debugger)
- Boot status (patterns matched, boot time)
- Change tracking (files changed, diff)
- Memory analysis (if `/memory` was used)
- Agentic session (tool calls, iterations, files read/written)

View evidence:
```
fwai> /evidence           # List recent runs
fwai> /evidence <run-id>  # Show specific run details
```

## Policy Engine

Safety guardrails protect your firmware:

- **Protected paths**: Files matching patterns (e.g., `boot/**`, `*.ld`) cannot be modified
- **Change budget**: Maximum files and lines that can change per run
- **Flash guard**: Requires successful build before flashing
- **Confirmation**: Destructive operations require explicit approval

## CI/CD Integration

See [CI/CD Guide](cicd-guide.md) for GitHub Actions and GitLab CI examples.

```bash
# Run a skill in CI mode
fwai run bringup --ci --yes --json

# Exit codes:
# 0 = success
# 1 = tool failure
# 3 = flash guard / confirmation required
# 4 = change budget exceeded
```
