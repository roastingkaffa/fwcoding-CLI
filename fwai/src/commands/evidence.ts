import type { AppContext } from "../repl.js";
import type { Evidence } from "../schemas/evidence.schema.js";
import { listRecentRuns, loadEvidence } from "../core/evidence.js";
import * as log from "../utils/logger.js";

export async function handleEvidence(args: string, _ctx: AppContext): Promise<void> {
  if (args.trim()) {
    showRunDetail(args.trim());
    return;
  }
  showRunList();
}

function showRunList(): void {
  const runs = listRecentRuns(5);
  if (runs.length === 0) {
    log.info("No runs found yet.");
    return;
  }

  log.heading("\nRecent Runs:");
  log.line();
  for (let i = 0; i < runs.length; i++) {
    const runId = runs[i];
    const evidence = loadEvidence(runId);
    if (!evidence) {
      console.log(`  #${i + 1}  ${runId}  (no evidence)`);
      continue;
    }
    const toolSummary = evidence.tools
      .map((t) => `${t.tool} ${t.status === "success" ? "✓" : "✗"}`)
      .join(" ");
    const duration = (evidence.duration_ms / 1000).toFixed(1);
    const status = evidence.status.toUpperCase().padEnd(8);
    console.log(`  #${i + 1}  ${runId}  ${status}  [${toolSummary}]  ${duration}s`);
  }
  log.line();
  console.log("\n  Use /evidence <run-id> for details.\n");
}

function showRunDetail(runIdInput: string): void {
  // Support partial matching (e.g. /evidence #1 or /evidence 20260226)
  const runs = listRecentRuns(20);
  let runId = runIdInput;

  // Match by index (e.g. "#1", "1")
  const indexMatch = runIdInput.match(/^#?(\d+)$/);
  if (indexMatch) {
    const idx = parseInt(indexMatch[1], 10) - 1;
    if (idx >= 0 && idx < runs.length) {
      runId = runs[idx];
    }
  }

  // Match by prefix
  if (!runs.includes(runId)) {
    const match = runs.find((r) => r.startsWith(runIdInput));
    if (match) runId = match;
  }

  const evidence = loadEvidence(runId);
  if (!evidence) {
    log.error(`Run not found: ${runIdInput}`);
    return;
  }

  printEvidenceDetail(evidence);
}

function printEvidenceDetail(ev: Evidence): void {
  // Header
  log.heading(`\nRun: ${ev.run_id}`);
  log.line();

  // Summary
  const statusIcon = ev.status === "success" ? "✓" : ev.status === "partial" ? "⚠" : "✗";
  console.log(`  Status:     ${statusIcon} ${ev.status.toUpperCase()}`);
  if (ev.skill) console.log(`  Skill:      ${ev.skill}`);
  console.log(`  Start:      ${ev.start_time}`);
  console.log(`  Duration:   ${(ev.duration_ms / 1000).toFixed(1)}s`);

  // Project
  console.log("");
  console.log(`  Project:    ${ev.project.name}`);
  console.log(`  MCU:        ${ev.project.target_mcu}`);
  if (ev.project.arch) console.log(`  Arch:       ${ev.project.arch}`);
  if (ev.project.board) console.log(`  Board:      ${ev.project.board}`);
  if (ev.project.flash_size || ev.project.ram_size) {
    console.log(
      `  Memory:     Flash ${ev.project.flash_size ?? "?"} | RAM ${ev.project.ram_size ?? "?"}`
    );
  }
  if (ev.project.git_branch) {
    console.log(
      `  Git:        ${ev.project.git_branch}${ev.project.git_commit ? ` (${ev.project.git_commit})` : ""}`
    );
  }

  // Tools
  if (ev.tools.length > 0) {
    console.log("");
    log.heading("  Tools:");
    for (const t of ev.tools) {
      const icon = t.status === "success" ? "✓" : "✗";
      const dur = `${t.duration_ms}ms`;
      const pat = t.pattern_matched ? ` [${t.pattern_matched}]` : "";
      console.log(`    ${icon} ${t.tool.padEnd(12)} ${t.status.padEnd(8)} ${dur.padEnd(8)}${pat}`);
      console.log(
        `      cmd: ${t.command.length > 60 ? t.command.slice(0, 60) + "..." : t.command}`
      );
    }
  }

  // Hardware
  if (ev.hardware) {
    console.log("");
    log.heading("  Hardware:");
    console.log(`    Serial:     ${ev.hardware.serial_port}`);
    console.log(`    Debugger:   ${ev.hardware.debugger}`);
    if (ev.hardware.connection_type) console.log(`    Connection: ${ev.hardware.connection_type}`);
    if (ev.hardware.detected_device) console.log(`    Device:     ${ev.hardware.detected_device}`);
    if (ev.hardware.flash_verified != null)
      console.log(`    Verified:   ${ev.hardware.flash_verified ? "yes" : "no"}`);
  }

  // Boot Status
  if (ev.boot_status) {
    console.log("");
    log.heading("  Boot Status:");
    const bIcon =
      ev.boot_status.status === "success" ? "✓" : ev.boot_status.status === "fail" ? "✗" : "?";
    console.log(`    ${bIcon} ${ev.boot_status.status.toUpperCase()}`);
    if (ev.boot_status.matched_pattern)
      console.log(`    Pattern:    ${ev.boot_status.matched_pattern}`);
    if (ev.boot_status.boot_time_ms != null)
      console.log(`    Boot time:  ${ev.boot_status.boot_time_ms}ms`);
  }

  // Changes
  if (ev.changes) {
    console.log("");
    log.heading("  Changes:");
    console.log(`    Files:      ${ev.changes.files_changed}`);
    console.log(`    Lines:      +${ev.changes.lines_added} / -${ev.changes.lines_removed}`);
    console.log(`    Budget:     ${ev.changes.within_budget ? "within" : "EXCEEDED"}`);
    console.log(`    Diff:       ${ev.changes.diff_path}`);
  }

  // LLM
  if (ev.llm) {
    console.log("");
    log.heading("  LLM Tracing:");
    console.log(`    Provider:   ${ev.llm.provider}`);
    console.log(`    Model:      ${ev.llm.model}`);
    console.log(`    Calls:      ${ev.llm.calls.length}`);
    console.log(
      `    Tokens:     ${ev.llm.total_input_tokens} in / ${ev.llm.total_output_tokens} out`
    );
    if (ev.llm.estimated_cost_usd != null)
      console.log(`    Cost:       $${ev.llm.estimated_cost_usd.toFixed(4)}`);
  }

  log.line();
  console.log("");
}
