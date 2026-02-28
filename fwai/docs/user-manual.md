# fwai User Manual

## Commercial Features (Phase 4)

### Plugin Marketplace

Discover and install community-built tools, skills, and agents.

```bash
# Search for plugins
fwai> /marketplace search stm32

# Install a plugin
fwai> /marketplace install stm32-bsp-tools

# List installed plugins
fwai> /marketplace list

# Remove a plugin
fwai> /marketplace uninstall stm32-bsp-tools

# Get plugin details
fwai> /marketplace info stm32-bsp-tools
```

Plugins are stored in `.fwai/plugins/<name>/` and can contain `tools/`, `skills/`, and `agents/` directories.

### Team License & Cloud Dashboard

Activate a license to unlock commercial features.

```bash
# Check license status
fwai> /license status

# Activate a license key
fwai> /license activate FWAI-XXXX-XXXX-XXXX

# Deactivate license
fwai> /license deactivate
```

Feature tiers: `community` (free), `pro` (plugins + GDB), `team` (audit + OTA + cloud sync), `enterprise` (all).

### Audit Trail / Compliance Export

Export run evidence for compliance (ISO 26262, DO-178C, IEC 62443).

```bash
# Show audit summary
fwai> /audit summary

# Export as JSON
fwai> /audit export --format json --output report.json

# Export as SARIF (for CI integration)
fwai audit export --format sarif --output report.sarif

# Export as CSV
fwai> /audit export --format csv --since 2026-01-01

# Export as HTML report
fwai> /audit export --format html --output report.html

# Verify chain hash integrity
fwai> /audit verify <hash>
```

### OTA Update Workflow

Build, deploy, and rollback firmware OTA bundles.

```bash
# Create an OTA bundle
fwai> /ota bundle --version 1.2.0 --elf build/firmware.elf

# List available bundles
fwai> /ota list

# Deploy to a specific target
fwai> /ota deploy --target device-001

# Deploy to all configured targets
fwai> /ota deploy --all

# View deployment history
fwai> /ota status

# Rollback a device
fwai> /ota rollback device-001 1.1.0
```

Configure targets in `project.yaml`:

```yaml
project:
  ota:
    enabled: true
    bundle_dir: .fwai/ota
    targets:
      - device_id: device-001
        transport: serial
        endpoint: /dev/ttyUSB0
      - device_id: device-002
        transport: network
        endpoint: http://192.168.1.100/ota
    policy:
      require_checksum: true
      confirm: true
```

### GDB/Debug Integration

Debug firmware with GDB from the REPL or let the AI agent debug autonomously.

```bash
# Run GDB commands on an ELF
fwai> /debug run build/firmware.elf "break main" "run" "info registers"

# Dump registers
fwai> /debug registers build/firmware.elf

# Get backtrace
fwai> /debug backtrace build/firmware.elf

# Start OpenOCD server
fwai> /debug openocd
```

Configure in `project.yaml`:

```yaml
project:
  toolchain:
    debugger: arm-none-eabi-gdb
    openocd_config: board/stm32f4discovery.cfg
    gdb_remote: localhost:3333
```

The `gdb_debug` agentic tool is also available to the LLM, enabling autonomous debugging with breakpoints, register inspection, and memory reads.

## Enterprise Features (Phase 5)

### Security

Scan for leaked secrets and redact them from evidence and logs.

```bash
# Scan workspace for exposed secrets
fwai> /security scan

# Audit npm dependencies + plugin integrity
fwai> /security audit-deps
```

Secret patterns (API keys, tokens, PEM blocks) are redacted automatically in evidence records. Configure custom patterns in `config.yaml`:

```yaml
security:
  secret_patterns: ["MY_CUSTOM_\\d+"]
  redact_in_evidence: true
  redact_in_logs: true
```

### Signed Evidence

Sign evidence records with Ed25519 for tamper detection.

```bash
# Generate a signing key pair
fwai> /security keygen

# Verify a specific run's signature
fwai> /security verify <run-id>

# Verify all evidence signatures
fwai> /security verify-all
```

Enable automatic signing in `config.yaml`:

```yaml
security:
  signing:
    enabled: true
    key_path: .fwai/keys/evidence.key
    algorithm: ed25519
```

### SBOM Generation

Generate CycloneDX 1.5 Software Bill of Materials alongside evidence.

Enable in policy:

```yaml
policy:
  require_sbom: true
```

The SBOM includes npm dependencies, firmware libraries from `project.yaml`, and toolchain binaries.

### CI/CD Integration

GitHub Actions workflows are provided in `.github/workflows/`:

- `fwai-ci.yml` — lint, test, and audit on push/PR
- `fwai-release.yml` — publish to npm and generate SBOM on tag

CI environment is auto-detected. In GitHub Actions, fwai writes a step summary with run status, duration, cost, and SBOM info.

### Org Policy

Enforce organization-wide policies that override project settings.

```bash
# Show merged policy (project + org)
fwai> /policy show

# Validate config against org policy
fwai> /policy validate

# Refresh remote org policy
fwai> /policy refresh

# Show differences between project and org policy
fwai> /policy diff
```

Configure in `config.yaml`:

```yaml
org_policy:
  path: ./org-policy.json    # local path
  # url: https://policies.acme.com/firmware.json  # or remote
  enforce: true
  refresh_interval_sec: 3600
```
