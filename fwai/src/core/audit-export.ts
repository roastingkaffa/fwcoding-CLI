import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getRunsDir } from "../utils/paths.js";
import type { Evidence } from "../schemas/evidence.schema.js";
import { loadSigningKey, signAuditExport } from "./evidence-signer.js";

export interface AuditFilter {
  since?: string;
  until?: string;
  status?: string;
  skill?: string;
  limit?: number;
}

/** Scan all evidence.json files in .fwai/runs/ directories, parse, filter, sort by start_time */
export function collectAllEvidence(filter?: AuditFilter, cwd?: string): Evidence[] {
  const runsDir = getRunsDir(cwd);
  if (!fs.existsSync(runsDir)) return [];

  const dirs = fs.readdirSync(runsDir).sort();
  let results: Evidence[] = [];

  for (const dir of dirs) {
    const evidencePath = path.join(runsDir, dir, "evidence.json");
    if (!fs.existsSync(evidencePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(evidencePath, "utf-8")) as Evidence;
      results.push(raw);
    } catch {
      // skip malformed evidence files
    }
  }

  // Apply filters
  if (filter?.since) {
    const since = new Date(filter.since).getTime();
    results = results.filter((e) => new Date(e.start_time).getTime() >= since);
  }
  if (filter?.until) {
    const until = new Date(filter.until).getTime();
    results = results.filter((e) => new Date(e.start_time).getTime() <= until);
  }
  if (filter?.status) {
    results = results.filter((e) => e.status === filter.status);
  }
  if (filter?.skill) {
    results = results.filter((e) => e.skill === filter.skill);
  }

  // Sort by start_time ascending
  results.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  if (filter?.limit && filter.limit > 0) {
    results = results.slice(-filter.limit);
  }

  return results;
}

/** Export as formatted JSON array */
export function exportAsJson(evidence: Evidence[]): string {
  return JSON.stringify(evidence, null, 2);
}

/** Export as JSON Lines (one JSON object per line) */
export function exportAsJsonLines(evidence: Evidence[]): string {
  return evidence.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

/** Export as CSV with header row */
export function exportAsCsv(evidence: Evidence[]): string {
  const header = "run_id,skill,status,duration_ms,tool_count,files_changed,cost";
  const rows = evidence.map((e) => {
    const toolCount = e.tools.length;
    const filesChanged = e.changes?.files_changed ?? 0;
    const cost = e.llm?.estimated_cost_usd?.toFixed(6) ?? "";
    return `${e.run_id},${e.skill ?? ""},${e.status},${e.duration_ms},${toolCount},${filesChanged},${cost}`;
  });
  return [header, ...rows].join("\n") + "\n";
}

/** Export as SARIF 2.1.0 format (tool failures as diagnostics) */
export function exportAsSarif(evidence: Evidence[]): string {
  const results = evidence.flatMap((e) =>
    e.tools
      .filter((t) => t.status === "fail")
      .map((t) => ({
        ruleId: `fwai/${t.tool}-failure`,
        level: "error" as const,
        message: { text: `Tool '${t.tool}' failed (exit code ${t.exit_code})` },
        properties: {
          run_id: e.run_id,
          duration_ms: t.duration_ms,
          log_file: t.log_file,
        },
      }))
  );

  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "fwai",
            version: "0.1.0",
            informationUri: "https://fwai.dev",
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

/** Export as self-contained HTML with summary table */
export function exportAsHtml(evidence: Evidence[], projectName?: string): string {
  const title = projectName ? `${projectName} — Audit Report` : "FWAI Audit Report";
  const totalRuns = evidence.length;
  const passed = evidence.filter((e) => e.status === "success").length;
  const failed = evidence.filter((e) => e.status === "fail").length;

  const rows = evidence
    .map(
      (e) =>
        `<tr><td>${e.run_id}</td><td>${e.skill ?? "-"}</td><td class="${e.status}">${e.status}</td><td>${e.duration_ms}ms</td><td>${e.tools.length}</td></tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui;margin:2em}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}
.success{color:green}.fail{color:red}.partial{color:orange}
.summary{display:flex;gap:2em;margin-bottom:1em}</style></head>
<body><h1>${title}</h1>
<div class="summary"><span>Total: ${totalRuns}</span><span class="success">Passed: ${passed}</span><span class="fail">Failed: ${failed}</span></div>
<table><thead><tr><th>Run ID</th><th>Skill</th><th>Status</th><th>Duration</th><th>Tools</th></tr></thead>
<tbody>${rows}</tbody></table>
<footer><p>Generated by fwai v0.1.0 at ${new Date().toISOString()}</p></footer></body></html>`;
}

/** Compute SHA-256 chain hash of ordered evidence for tamper detection */
export function computeChainHash(evidence: Evidence[]): string {
  const hash = crypto.createHash("sha256");
  for (const e of evidence) {
    hash.update(e.run_id + JSON.stringify(e));
  }
  return hash.digest("hex");
}

/** Recompute chain hash from stored evidence and compare */
export function verifyChainHash(expectedHash: string, cwd?: string): { valid: boolean; computed: string } {
  const evidence = collectAllEvidence(undefined, cwd);
  const computed = computeChainHash(evidence);
  return { valid: computed === expectedHash, computed };
}

/** Export evidence with a detached .sig file alongside the export */
export function exportWithSignature(
  evidence: Evidence[],
  content: string,
  outputPath: string,
  privateKeyPath?: string
): void {
  fs.writeFileSync(outputPath, content);

  if (privateKeyPath) {
    try {
      const privateKey = loadSigningKey(privateKeyPath);
      const { signature, signed_at } = signAuditExport(content, privateKey);
      const sigPath = outputPath + ".sig";
      fs.writeFileSync(sigPath, JSON.stringify({ signature, signed_at, algorithm: "ed25519" }, null, 2));
    } catch {
      // Signing key not available — skip signature
    }
  }
}

/** Append a single evidence record as JSONL to audit log */
export function appendToAuditLog(evidence: Evidence, logPath: string): void {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(logPath, JSON.stringify(evidence) + "\n");
}
