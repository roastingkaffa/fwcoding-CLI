import fs from "node:fs";
import type { AppContext } from "../repl.js";
import {
  collectAllEvidence,
  exportAsJson,
  exportAsJsonLines,
  exportAsCsv,
  exportAsSarif,
  exportAsHtml,
  computeChainHash,
  verifyChainHash,
} from "../core/audit-export.js";
import * as log from "../utils/logger.js";

export async function handleAudit(args: string, ctx: AppContext): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0] || "summary";

  if (sub === "export") {
    const format = extractFlag(parts, "--format") || "json";
    const since = extractFlag(parts, "--since");
    const until = extractFlag(parts, "--until");
    const output = extractFlag(parts, "--output");

    const evidence = collectAllEvidence({ since: since ?? undefined, until: until ?? undefined });

    let content: string;
    switch (format) {
      case "jsonl":
        content = exportAsJsonLines(evidence);
        break;
      case "csv":
        content = exportAsCsv(evidence);
        break;
      case "sarif":
        content = exportAsSarif(evidence);
        break;
      case "html":
        content = exportAsHtml(evidence, ctx.project.project.name);
        break;
      default:
        content = exportAsJson(evidence);
    }

    if (output) {
      fs.writeFileSync(output, content);
      log.success(`Exported ${evidence.length} runs to ${output} (${format})`);
    } else {
      process.stdout.write(content);
    }
    return;
  }

  if (sub === "verify") {
    const runId = parts[1];
    if (!runId) {
      const evidence = collectAllEvidence();
      const hash = computeChainHash(evidence);
      log.info(`Chain hash (${evidence.length} runs): ${hash}`);
      return;
    }
    // Verify against stored hash
    const result = verifyChainHash(runId);
    if (result.valid) {
      log.success("Chain hash verified — no tampering detected.");
    } else {
      log.error(`Chain hash mismatch! Expected: ${runId}, Computed: ${result.computed}`);
    }
    return;
  }

  if (sub === "summary") {
    const evidence = collectAllEvidence();
    if (evidence.length === 0) {
      log.info("No runs found.");
      return;
    }
    const passed = evidence.filter((e) => e.status === "success").length;
    const failed = evidence.filter((e) => e.status === "fail").length;
    const partial = evidence.filter((e) => e.status === "partial").length;
    const totalDuration = evidence.reduce((sum, e) => sum + e.duration_ms, 0);
    const avgDuration = Math.round(totalDuration / evidence.length);
    const totalCost = evidence.reduce((sum, e) => sum + (e.llm?.estimated_cost_usd ?? 0), 0);

    log.heading("Audit Summary");
    log.info(`Total runs:     ${evidence.length}`);
    log.info(`Passed:         ${passed}`);
    log.info(`Failed:         ${failed}`);
    log.info(`Partial:        ${partial}`);
    log.info(`Avg duration:   ${avgDuration}ms`);
    log.info(`Total LLM cost: $${totalCost.toFixed(4)}`);
    log.info(`Chain hash:     ${computeChainHash(evidence).slice(0, 16)}...`);
    return;
  }

  log.error(`Unknown audit subcommand: ${sub}. Use: export, verify, summary`);
}

function extractFlag(parts: string[], flag: string): string | null {
  const idx = parts.indexOf(flag);
  if (idx === -1 || idx + 1 >= parts.length) return null;
  return parts[idx + 1];
}
