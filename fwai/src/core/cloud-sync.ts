import type { Evidence } from "../schemas/evidence.schema.js";
import type { CloudConfig } from "../schemas/license.schema.js";
import * as log from "../utils/logger.js";

/** Sync a single run's evidence summary to the cloud dashboard (fire-and-forget) */
export async function syncRunToCloud(evidence: Evidence, cloudConfig: CloudConfig): Promise<void> {
  const url = `${cloudConfig.dashboard_url}/api/runs`;
  const payload = {
    run_id: evidence.run_id,
    project: evidence.project.name,
    status: evidence.status,
    duration_ms: evidence.duration_ms,
    tool_count: evidence.tools.length,
    cost: evidence.llm?.estimated_cost_usd ?? 0,
    skill: evidence.skill,
    start_time: evidence.start_time,
    team_id: cloudConfig.team_id,
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    log.debug(`Cloud sync failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Bulk sync multiple evidence records to the cloud */
export async function syncAuditBatch(
  evidences: Evidence[],
  cloudConfig: CloudConfig
): Promise<void> {
  const url = `${cloudConfig.dashboard_url}/api/runs/batch`;
  const payload = evidences.map((e) => ({
    run_id: e.run_id,
    project: e.project.name,
    status: e.status,
    duration_ms: e.duration_ms,
    tool_count: e.tools.length,
    cost: e.llm?.estimated_cost_usd ?? 0,
    skill: e.skill,
    start_time: e.start_time,
    team_id: cloudConfig.team_id,
  }));

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    log.debug(`Cloud batch sync failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
