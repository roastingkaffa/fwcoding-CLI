import fs from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { getRunsDir, generateRunId } from "../utils/paths.js";
import { globalTracer } from "../utils/llm-tracer.js";
import { generateDiff, getGitBranch, getGitCommit } from "./diff.js";
import { EvidenceSchema, type Evidence, type ToolResult, type HardwareState, type BootStatus, type AgenticSession, type MemoryAnalysis } from "../schemas/evidence.schema.js";
import type { ProjectContext } from "../utils/project-context.js";
import * as log from "../utils/logger.js";

export interface RunSession {
  runId: string;
  runDir: string;
  startTime: Date;
  toolResults: ToolResult[];
  skill?: string;
  hardwareState?: HardwareState;
  bootStatus?: BootStatus;
  agenticSession?: AgenticSession;
  memoryAnalysis?: MemoryAnalysis;
}

/** Create a new run directory and session */
export function createRunSession(label: string, skill?: string, cwd?: string): RunSession {
  const runId = generateRunId(label);
  const runDir = path.join(getRunsDir(cwd), runId);
  fs.mkdirSync(runDir, { recursive: true });

  return {
    runId,
    runDir,
    startTime: new Date(),
    toolResults: [],
    skill,
  };
}

/** Write evidence.json to the run directory */
export function writeEvidence(
  session: RunSession,
  projectCtx: ProjectContext
): Evidence {
  const endTime = new Date();
  const overallStatus = session.toolResults.every((t) => t.status === "success")
    ? "success"
    : session.toolResults.some((t) => t.status === "success")
      ? "partial"
      : "fail";

  // Generate diff.patch and parse changes
  const { changes } = generateDiff(session.runDir);

  // Get git info for project context
  const gitBranch = getGitBranch();
  const gitCommit = getGitCommit();

  const tracer = globalTracer;
  const evidence: Evidence = {
    run_id: session.runId,
    skill: session.skill,
    start_time: session.startTime.toISOString(),
    end_time: endTime.toISOString(),
    duration_ms: endTime.getTime() - session.startTime.getTime(),
    status: overallStatus,
    tools: session.toolResults,
    changes: changes ?? undefined,
    project: {
      name: projectCtx.name,
      target_mcu: projectCtx.mcu,
      arch: projectCtx.arch,
      board: projectCtx.board,
      flash_size: projectCtx.flash_size,
      ram_size: projectCtx.ram_size,
      git_branch: gitBranch,
      git_commit: gitCommit,
    },
    hardware: session.hardwareState,
    boot_status: session.bootStatus,
    agentic: session.agenticSession,
    memory: session.memoryAnalysis,
    llm:
      tracer.getCalls().length > 0
        ? {
            provider: tracer.getProvider(),
            model: tracer.getModel(),
            calls: tracer.getCalls(),
            total_input_tokens: tracer.getTotalInputTokens(),
            total_output_tokens: tracer.getTotalOutputTokens(),
            estimated_cost_usd: tracer.getEstimatedCost(),
          }
        : undefined,
  };

  // Parse detected_device from flash log if available
  if (evidence.hardware) {
    const flashResult = session.toolResults.find((t) => t.tool === "flash");
    if (flashResult) {
      const detectedDevice = parseDetectedDevice(
        path.join(session.runDir, flashResult.log_file)
      );
      if (detectedDevice) {
        evidence.hardware.detected_device = detectedDevice;
      }
    }
  }

  // Validate evidence with zod schema
  try {
    EvidenceSchema.parse(evidence);
  } catch (e) {
    if (e instanceof ZodError) {
      log.warn(`Evidence schema validation warning: ${e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`);
    }
  }

  const evidencePath = path.join(session.runDir, "evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  log.success(`Evidence written to ${evidencePath}`);

  return evidence;
}

/** Parse detected device from flash tool log output */
function parseDetectedDevice(logPath: string): string | undefined {
  if (!fs.existsSync(logPath)) return undefined;
  const content = fs.readFileSync(logPath, "utf-8");

  // Common flasher output patterns
  const patterns: Array<{ re: RegExp; group: number }> = [
    // OpenOCD: "Info : device id = 0x10006413"
    { re: /device id\s*[:=]\s*(0x[0-9a-fA-F]+)/i, group: 1 },
    // OpenOCD: "Info : STM32F407xx"
    { re: /Info\s*:\s*(STM32\w+)/i, group: 1 },
    // ST-Link: "Device: STM32F4xx"
    { re: /Device:\s*(\S+)/i, group: 1 },
    // pyOCD: "Target: stm32f407vg"
    { re: /Target:\s*(\S+)/i, group: 1 },
    // Generic: "Detected: ..."
    { re: /[Dd]etected[:\s]+(\S+)/, group: 1 },
  ];

  for (const { re, group } of patterns) {
    const match = content.match(re);
    if (match) return match[group];
  }
  return undefined;
}

/** Build HardwareState from project config */
export function buildHardwareState(
  project: { serial: { port: string }; toolchain: { debugger?: string; flasher?: string } }
): HardwareState {
  return {
    serial_port: project.serial.port,
    debugger: project.toolchain.debugger ?? project.toolchain.flasher ?? "unknown",
    connection_type: project.toolchain.debugger ? "jtag/swd" : "serial",
  };
}

/** List recent runs (most recent first) */
export function listRecentRuns(limit = 5, cwd?: string): string[] {
  const runsDir = getRunsDir(cwd);
  if (!fs.existsSync(runsDir)) return [];
  return fs
    .readdirSync(runsDir)
    .sort()
    .reverse()
    .slice(0, limit);
}

/** Load evidence.json from a run directory */
export function loadEvidence(runId: string, cwd?: string): Evidence | null {
  const evidencePath = path.join(getRunsDir(cwd), runId, "evidence.json");
  if (!fs.existsSync(evidencePath)) return null;
  return JSON.parse(fs.readFileSync(evidencePath, "utf-8")) as Evidence;
}
