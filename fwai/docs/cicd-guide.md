# fwai CI/CD Integration Guide

## Overview

fwai can run in CI mode for automated firmware builds, testing, and deployment.
CI mode disables interactive prompts, enforces strict policy checks, and outputs
machine-readable JSON summaries.

## CLI Flags

```bash
fwai run <skill> --ci --yes --json
```

| Flag | Description |
|------|-------------|
| `--ci` | Enable CI mode (no interactive prompts, strict policy) |
| `--yes` | Auto-approve confirmation prompts (required for flash in CI) |
| `--json` | Output JSON summary to stdout on completion |
| `--quiet` | Suppress all non-error output |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All steps succeeded |
| 1 | One or more tool steps failed |
| 3 | Flash guard failed or confirmation required without `--yes` |
| 4 | Change budget exceeded |

## GitHub Actions

```yaml
name: Firmware CI
on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install ARM toolchain
        run: |
          sudo apt-get update
          sudo apt-get install -y gcc-arm-none-eabi

      - name: Install fwai
        run: npm install -g fwai

      - name: Run bringup skill
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          fwai run bringup --ci --yes --json > evidence-summary.json

      - name: Upload evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: firmware-evidence
          path: |
            .fwai/runs/
            evidence-summary.json

      - name: Check memory usage
        run: |
          fwai run memory-check --ci --json || true
```

### With Matrix Strategy (Multiple Boards)

```yaml
jobs:
  firmware-ci:
    strategy:
      matrix:
        board: [stm32f4-disco, nucleo-f446re, custom-board]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        run: |
          sudo apt-get install -y gcc-arm-none-eabi
          npm install -g fwai

      - name: Build & Test
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          FWAI_BOARD: ${{ matrix.board }}
        run: |
          fwai run bringup --ci --yes --json
```

## GitLab CI

```yaml
stages:
  - build
  - test
  - deploy

variables:
  ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY

firmware-build:
  stage: build
  image: node:20
  before_script:
    - apt-get update && apt-get install -y gcc-arm-none-eabi
    - npm install -g fwai
  script:
    - fwai run bringup --ci --yes --json > evidence.json
  artifacts:
    when: always
    paths:
      - .fwai/runs/
      - evidence.json
    reports:
      dotenv: evidence.json

firmware-test:
  stage: test
  image: node:20
  before_script:
    - apt-get update && apt-get install -y gcc-arm-none-eabi
    - npm install -g fwai
  script:
    - fwai run diagnose --ci --json
  artifacts:
    when: always
    paths:
      - .fwai/runs/
```

## Evidence in CI

In CI mode, the JSON summary written to stdout contains:

```json
{
  "run_id": "20260227-143052-bringup",
  "status": "success",
  "duration_ms": 12500,
  "tools": [
    {"tool": "build", "status": "success", "duration_ms": 8200},
    {"tool": "flash", "status": "success", "duration_ms": 3100},
    {"tool": "monitor", "status": "success", "duration_ms": 1200}
  ],
  "boot_status": {
    "status": "success",
    "matched_pattern": "[BOOT] System ready",
    "boot_time_ms": 850
  },
  "llm": {
    "total_input_tokens": 1420,
    "total_output_tokens": 380,
    "estimated_cost_usd": 0.0098
  }
}
```

## Tips

1. **API key management**: Store LLM API keys as CI secrets, never in code
2. **Evidence archival**: Upload `.fwai/runs/` as artifacts for audit trails
3. **Timeout protection**: CI mode has a configurable watchdog (default: 600s)
4. **Change budget**: CI mode aborts on budget violations (exit code 4)
5. **Flash safety**: Always use `--yes` flag explicitly for flash operations in CI
