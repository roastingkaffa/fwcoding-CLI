# Contributing to fwai

Thanks for your interest in contributing! This guide covers how to add tools, skills, board profiles, and code changes.

## Development Setup

```bash
git clone https://github.com/anthropics/fwai.git
cd fwai/fwai
npm install
npm run build

# Verify with the mock example
cd ../examples/mock-stm32
node ../../fwai/dist/cli.js run bringup --ci --yes
```

During development, use `npm run dev` for watch mode (auto-recompile on changes).

## Adding a New Tool

Tools are YAML files in `.fwai/tools/`. Each tool wraps a shell command.

Create `.fwai/tools/mytool.tool.yaml`:

```yaml
name: mytool
description: "What this tool does"
command: "your-command --flags"
working_dir: "."
timeout_sec: 30
success_patterns:
  - "pattern that indicates success"
failure_patterns:
  - "pattern that indicates failure"
```

Optional fields:

```yaml
# Require user confirmation before running
guard:
  require_confirmation: true
  message: "Run mytool? (y/N) "

# Collect output artifacts
artifacts:
  - path: "build/*.bin"
    label: firmware_binary
```

## Adding a New Skill

Skills are YAML files in `.fwai/skills/`. Each skill is a sequence of tool steps and actions.

Create `.fwai/skills/myskill.skill.yaml`:

```yaml
name: myskill
description: "What this workflow does"
steps:
  - tool: build
    on_fail: abort          # or "continue"
  - tool: flash
    on_fail: abort
  - action: evidence
    summary: true
triggers:
  - "myskill"
  - "keyword that triggers this skill"
```

Available step types:

| Type | Description |
|------|-------------|
| `tool: <name>` | Run a tool by name |
| `action: evidence` | Write evidence.json |
| `action: llm_analyze` | Send a file to the LLM for analysis |

## Adding a Board Profile

Board profiles are `project.yaml` configurations tailored to specific hardware.

1. Create a directory: `examples/my-board/`
2. Run `fwai init` inside it
3. Edit `.fwai/project.yaml` with your MCU, boot patterns, and serial config
4. Replace tool commands with your real toolchain commands
5. Add a `README.md` with setup instructions

Example `project.yaml` for ESP32:

```yaml
project:
  name: esp32-demo
  target:
    mcu: ESP32-S3
    arch: xtensa-lx7
    board: ESP32-S3-DevKitC
    flash_size: 8MB
    ram_size: 512KB
  serial:
    port: /dev/ttyACM0
    baud: 115200
  boot:
    success_patterns:
      - "app_main"
      - "WiFi connected"
    failure_patterns:
      - "Guru Meditation"
      - "abort()"
  toolchain:
    compiler: xtensa-esp32s3-elf-gcc
    flasher: esptool.py
```

## Code Changes

### Structure

```
fwai/src/
  cli.ts                 # Entry point, commander setup
  repl.ts                # Interactive REPL
  core/                  # Runner, evidence, policy, config
  skills/                # Skill loading, execution, intent resolution
  providers/             # LLM provider implementations
  utils/                 # Logger, paths, context
  schemas/               # Zod schemas
```

### Conventions

- TypeScript strict mode (`strict: true`)
- ESM modules (`"type": "module"` in package.json)
- Imports use `.js` extensions (Node16 module resolution)
- Logging via `src/utils/logger.ts` — never use bare `console.log` in the run path
- Errors go to stderr via `log.error()`, content output via `log.output()`
- All tool execution goes through `src/core/runner.ts`

### Type checking

```bash
npm run lint    # tsc --noEmit
```

### Integration tests

```bash
npm run build
bash tests/integration/test-output-modes.sh
```

## Pull Request Guidelines

1. One feature or fix per PR
2. Include a test or demonstrate the change works (integration test or manual steps in PR description)
3. Run `npm run lint` before submitting
4. Keep the PR description concise: what changed and why

## Reporting Issues

- Include the output of `fwai doctor` if relevant
- Include the `evidence.json` from a failing run if applicable
- Specify your Node.js version and OS
