# Exit Codes

`fwai run` uses specific exit codes to communicate results to CI pipelines and scripts.

## Reference

| Code | Name | Description | When |
|------|------|-------------|------|
| **0** | Success | All tools completed successfully | `fwai run bringup --ci --yes` with all steps passing |
| **2** | Tool failure | One or more tools returned a non-success status | Build error, flash failure, monitor timeout without boot pattern |
| **3** | CI guard rejected | A guarded tool (e.g., flash) requires `--yes` in CI mode | `fwai run bringup --ci` without `--yes` when skill includes flash |
| **4** | Budget exceeded | Git diff exceeds `policy.change_budget` limits | Too many files or lines changed before a build step |
| **5** | Skill not found | The requested skill does not exist, or REPL denied in CI mode | `fwai run nonexistent` or bare `fwai` when mode is CI-only |
| **7** | Watchdog timeout | CI total duration exceeded `mode.ci.max_total_duration_sec` | Skill takes longer than the configured timeout |

## Usage in CI

### GitHub Actions

```yaml
- name: Firmware bring-up
  run: |
    cd examples/mock-stm32
    npx fwai run bringup --ci --yes --json > result.json
  continue-on-error: true

- name: Check result
  run: |
    exit_code=$(jq .exit_code result.json)
    if [ "$exit_code" -ne 0 ]; then
      echo "Bring-up failed with code $exit_code"
      jq . result.json
      exit $exit_code
    fi
```

### Shell script

```bash
fwai run bringup --ci --yes --json > result.json
rc=$?

case $rc in
  0) echo "All good" ;;
  2) echo "Tool failure — check logs" ;;
  3) echo "Flash requires --yes flag" ;;
  4) echo "Change budget exceeded — split your patch" ;;
  7) echo "Timed out" ;;
  *) echo "Unknown error: $rc" ;;
esac
```

## JSON output

When using `--json`, the exit code is also included in the JSON summary:

```json
{
  "run_id": "20260226-153457-bringup",
  "status": "success",
  "exit_code": 0,
  "tools": [...],
  "boot_status": {...},
  "evidence_path": ".fwai/runs/.../evidence.json",
  "estimated_cost_usd": null
}
```

The `status` field maps to exit codes:

| exit_code | status |
|-----------|--------|
| 0 | `success` |
| 2 | `tool_failure` |
| 3 | `ci_guard_rejected` |
| 4 | `budget_exceeded` |
| 5 | `skill_not_found` |
| 7 | `timeout` |

## Quiet mode

Use `--quiet` to suppress all stdout. Errors still go to stderr. The exit code is the sole signal:

```bash
fwai run bringup --ci --yes --quiet
echo "Exit code: $?"
```
