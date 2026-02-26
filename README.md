# fwai — Firmware AI CLI

AI-assisted firmware development with safety guardrails, evidence traceability, and pluggable LLM backends.

## Why fwai?

Firmware development has unique constraints that generic AI coding tools ignore:

| Problem | fwai Solution |
|---------|---------------|
| Build/flash/debug cycles are manual and error-prone | Automated skill workflows with evidence collection |
| Flashing wrong firmware can brick hardware | Flash guard, confirmation prompts, policy engine |
| No audit trail for what ran on which board | Timestamped evidence.json with tool results, boot status, git state |
| AI tools don't understand MCU constraints | Project context injection (MCU, arch, flash/RAM size) into every LLM call |
| CI pipelines can't easily run firmware workflows | `fwai run <skill> --ci --yes` with `--json` output and exit codes |

## Quickstart (no hardware needed)

```bash
git clone https://github.com/roastingkaffa/fwcoding-CLI.git
cd fwcoding-CLI/fwai
npm install && npm run build
cd ../examples/mock-stm32
node ../../fwai/dist/cli.js run bringup --ci --yes
```

Output:

```
Running skill: bringup
✓ build completed (105ms)
✓ flash completed (103ms)
✓ Boot pattern matched: System Ready
✓ monitor completed (305ms)
✓ Evidence written to .fwai/runs/.../evidence.json
ℹ Evidence: SUCCESS [build ✓, flash ✓, monitor ✓]
ℹ Boot: success (304ms) — "System Ready"
```

The generated `evidence.json` contains the full run trace: tool results, boot detection, timing, and git state.

## Features

- **Skill system** — Composable workflows (build -> flash -> monitor -> evidence) defined in YAML
- **Evidence traceability** — Every run produces timestamped `evidence.json` with full audit trail
- **Safety policy engine** — Protected paths, change budgets, flash guards, build-success requirements
- **Boot detection** — Pattern matching on UART output to determine boot success/failure
- **LLM integration** — Build log analysis, natural language skill resolution, project-aware context
- **CI-native** — `--ci`, `--json`, `--quiet` flags with well-defined [exit codes](docs/exit-codes.md)
- **Hardware state** — Serial port, debugger, detected device captured in evidence
- **Pluggable providers** — Anthropic (Claude) and OpenAI backends

## Architecture

```
.fwai/                     # Workspace (per-project)
  config.yaml              # Provider, policy, logging
  project.yaml             # MCU target, boot patterns, toolchain
  tools/*.tool.yaml        # Tool definitions (build, flash, monitor)
  skills/*.skill.yaml      # Workflow definitions (bringup, build-fix)
  agents/*.agent.yaml      # Agent personas (bsp, driver, rtos)
  runs/                    # Evidence output (gitignored)
```

## CLI Usage

```bash
# Interactive REPL
fwai

# Run a skill non-interactively
fwai run bringup --ci --yes

# JSON output for CI pipelines
fwai run bringup --ci --yes --json

# Quiet mode (suppress all stdout)
fwai run bringup --ci --yes --quiet

# Check toolchain health
fwai doctor

# Initialize workspace
fwai init
```

## REPL Commands

| Command | Description |
|---------|-------------|
| `/build` | Compile firmware |
| `/flash` | Flash to target (with confirmation) |
| `/monitor` | Capture UART output |
| `/evidence` | Show recent run history |
| `/config` | Display current configuration |
| `/skills` | List available skills |
| `/agents` | List available agents |
| `/help` | Show all commands |

Natural language also works: type "bringup", "fix build errors", or ask firmware questions directly.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 2 | Tool failure (build/flash/monitor failed) |
| 3 | CI guard rejected (flash requires `--yes`) |
| 4 | Change budget exceeded |
| 5 | Skill not found or REPL not allowed |
| 7 | CI watchdog timeout |

See [docs/exit-codes.md](docs/exit-codes.md) for details.

## Project Structure

```
fwai/
  src/
    cli.ts                 # CLI entry point (commander)
    repl.ts                # Interactive REPL
    core/
      config-loader.ts     # YAML config loading
      runner.ts            # Tool execution engine
      evidence.ts          # Evidence generation
      policy.ts            # Safety policy engine
    skills/
      skill-runner.ts      # Skill step execution
      skill-loader.ts      # Skill YAML loading
      intent-resolver.ts   # NL -> skill resolution
    providers/
      anthropic.ts         # Claude provider
      openai.ts            # OpenAI provider
    utils/
      logger.ts            # Logging with output modes
      llm-tracer.ts        # LLM call tracing
  examples/
    mock-stm32/            # No-hardware example
  docs/
    exit-codes.md          # Exit code reference
```

## Requirements

- Node.js >= 20
- No hardware or toolchain required for the mock example
- For LLM features: set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

## License

[Apache-2.0](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add tools, skills, board profiles, and more.
