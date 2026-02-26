#!/usr/bin/env bash
# Integration tests for --json and --quiet output modes
# Usage: bash tests/integration/test-output-modes.sh
# Requires: a test workspace at /tmp/fwai-test-p3 with .fwai/ and bringup skill

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="node ${SCRIPT_DIR}/../../dist/cli.js"
WORKDIR="/tmp/fwai-test-p3"
PASS=0
FAIL=0
TMPOUT=$(mktemp)
TMPERR=$(mktemp)
trap "rm -f $TMPOUT $TMPERR" EXIT

pass() { echo "  PASS: $1"; ((PASS++)); }
fail() { echo "  FAIL: $1"; ((FAIL++)); }

echo "=== Output Mode Integration Tests ==="
echo ""

# Test 1: --json produces valid JSON only on stdout, exit 0
(cd "$WORKDIR" && $CLI run bringup --ci --yes --json) >"$TMPOUT" 2>"$TMPERR"
rc=$?
if [ $rc -eq 0 ] && python3 -c "import sys,json; d=json.load(open('$TMPOUT')); assert d['exit_code']==0; assert d['status']=='success'" 2>/dev/null; then
  pass "--json produces valid JSON with exit_code=0"
else
  fail "--json produces valid JSON with exit_code=0 (rc=$rc)"
fi

# Test 2: --quiet produces empty stdout, exit 0
(cd "$WORKDIR" && $CLI run bringup --ci --yes --quiet) >"$TMPOUT" 2>"$TMPERR"
rc=$?
content=$(cat "$TMPOUT")
if [ $rc -eq 0 ] && [ -z "$content" ]; then
  pass "--quiet produces empty stdout"
else
  fail "--quiet produces empty stdout (rc=$rc, len=${#content})"
fi

# Test 3: --json with CI guard rejection (no --yes) → JSON with exit_code 3
(cd "$WORKDIR" && $CLI run bringup --ci --json) >"$TMPOUT" 2>"$TMPERR" || true
rc=${PIPESTATUS[0]:-$?}
if python3 -c "import sys,json; d=json.load(open('$TMPOUT')); assert d['exit_code']==3; assert d['status']=='ci_guard_rejected'" 2>/dev/null; then
  pass "--json with CI guard rejection gives exit_code=3"
else
  fail "--json with CI guard rejection gives exit_code=3"
fi

# Test 4: Normal run (no --json/--quiet) preserves rich output
(cd "$WORKDIR" && $CLI run bringup --ci --yes) >"$TMPOUT" 2>"$TMPERR"
if grep -q "Running skill: bringup" "$TMPOUT" && grep -q "build completed" "$TMPOUT" && grep -q "Evidence" "$TMPOUT"; then
  pass "Normal run preserves rich output"
else
  fail "Normal run preserves rich output"
fi

# Test 5: Pipe test — --json | parse .status
status=$( (cd "$WORKDIR" && $CLI run bringup --ci --yes --json 2>/dev/null) | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" )
if [ "$status" = "success" ]; then
  pass "--json piped to parser extracts status"
else
  fail "--json piped to parser extracts status (got: $status)"
fi

# Test 6: Non-TTY auto-detection — no ANSI codes in piped output
(cd "$WORKDIR" && $CLI run bringup --ci --yes 2>/dev/null) | cat >"$TMPOUT"
ansi_count=$(grep -cP '\x1b\[' "$TMPOUT" || true)
if [ "$ansi_count" -eq 0 ]; then
  pass "Non-TTY piped output has no ANSI codes"
else
  fail "Non-TTY piped output has no ANSI codes (found $ansi_count)"
fi

# Test 7: --json output includes expected fields
(cd "$WORKDIR" && $CLI run bringup --ci --yes --json) >"$TMPOUT" 2>/dev/null
if python3 -c "
import json
d = json.load(open('$TMPOUT'))
assert 'run_id' in d, 'missing run_id'
assert 'status' in d, 'missing status'
assert 'exit_code' in d, 'missing exit_code'
assert 'tools' in d, 'missing tools'
assert 'boot_status' in d, 'missing boot_status'
assert 'evidence_path' in d, 'missing evidence_path'
assert 'estimated_cost_usd' in d, 'missing estimated_cost_usd'
assert isinstance(d['tools'], list), 'tools not a list'
assert len(d['tools']) > 0, 'tools empty'
for t in d['tools']:
    assert 'tool' in t and 'status' in t and 'duration_ms' in t, f'bad tool entry: {t}'
" 2>/dev/null; then
  pass "--json output contains all expected fields"
else
  fail "--json output contains all expected fields"
fi

# Test 8: --json stderr still shows errors (not suppressed)
(cd "$WORKDIR" && $CLI run nonexistent --ci --yes --json) >/dev/null 2>"$TMPERR" || true
if grep -q "Skill not found" "$TMPERR"; then
  pass "--json still shows errors on stderr"
else
  fail "--json still shows errors on stderr"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
