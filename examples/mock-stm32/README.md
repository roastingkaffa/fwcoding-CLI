# Mock STM32 Example

Run a full firmware bring-up workflow **without any hardware or toolchain**.

All tools (build, flash, monitor) use `echo` commands to simulate a real STM32F407 development board. The evidence system, policy engine, and boot detection all work exactly as they would with real hardware.

## Quickstart

```bash
# 1. Install fwai (from repo root)
cd fwai && npm install && npm run build && cd ..

# 2. Run the mock bringup
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

## JSON output (for CI pipelines)

```bash
node ../../fwai/dist/cli.js run bringup --ci --yes --json
```

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
  }
}
```

## What's inside

```
.fwai/
  config.yaml          # LLM provider, safety policy, logging
  project.yaml         # Target MCU, boot patterns, toolchain
  tools/
    build.tool.yaml    # echo-based mock compiler
    flash.tool.yaml    # echo-based mock flasher
    monitor.tool.yaml  # echo-based mock UART monitor
  skills/
    bringup.skill.yaml # build -> flash -> monitor -> evidence
    build-fix.skill.yaml
```

## Adapting to real hardware

Replace the `command` field in each tool YAML with your real commands:

| Tool | Mock | Real (example) |
|------|------|----------------|
| build | `echo 'Build complete'` | `cmake --build build --parallel` |
| flash | `echo 'Programming Finished'` | `openocd -f board/stm32f4discovery.cfg -c 'program build/firmware.bin verify reset exit'` |
| monitor | `echo 'System Ready'` | `picocom -b 115200 /dev/ttyUSB0` |

Update `project.yaml` with your actual MCU, serial port, and boot patterns.
