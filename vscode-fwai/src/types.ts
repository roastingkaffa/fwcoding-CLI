/**
 * Local type definitions mirroring fwai schemas.
 * Avoids ESM/CJS type import issues while keeping type safety.
 */

// ── Config ──────────────────────────────────────────────────────────

export interface ProviderConfig {
  name: "anthropic" | "openai" | "gemini" | "local";
  model: string;
  api_key_env: string;
  max_tokens: number;
  temperature: number;
}

export interface Policy {
  protected_paths: string[];
  change_budget: { max_files_changed: number; max_lines_changed: number };
  flash_guard: { require_confirmation: boolean; require_build_success: boolean };
  require_evidence: boolean;
}

export interface Config {
  version: string;
  provider: ProviderConfig;
  policy: Policy;
  logging: { level: string; color: boolean };
}

// ── Project ─────────────────────────────────────────────────────────

export interface Target {
  mcu: string;
  arch?: string;
  board?: string;
  flash_size?: string;
  ram_size?: string;
}

export interface Project {
  project: {
    name: string;
    description?: string;
    target: Target;
    build: { system: string; build_dir: string; source_dir: string };
    serial: { port: string; baud: number };
    boot: { success_patterns: string[]; failure_patterns: string[] };
    toolchain: { compiler: string; debugger?: string; flasher?: string };
  };
}

// ── Evidence ────────────────────────────────────────────────────────

export interface ToolResult {
  tool: string;
  command: string;
  exit_code: number;
  duration_ms: number;
  log_file: string;
  status: "success" | "fail";
  pattern_matched?: string;
}

export interface BootStatus {
  status: "success" | "fail" | "unknown";
  matched_pattern?: string;
  boot_time_ms?: number;
}

export interface Changes {
  files_changed: number;
  lines_added: number;
  lines_removed: number;
  diff_path: string;
  within_budget: boolean;
}

export interface AgenticSession {
  tool_calls: Array<{
    tool_name: string;
    input_summary: string;
    output_summary: string;
    is_error: boolean;
    duration_ms: number;
  }>;
  total_iterations: number;
  files_read: string[];
  files_written: string[];
}

export interface Evidence {
  run_id: string;
  skill?: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: "success" | "fail" | "partial" | "aborted";
  tools: ToolResult[];
  changes?: Changes;
  boot_status?: BootStatus;
  agentic?: AgenticSession;
  project: { name: string; target_mcu: string };
}

// ── Skills ──────────────────────────────────────────────────────────

export type SkillStep =
  | { tool: string; on_fail: string; config?: Record<string, unknown> }
  | { action: "evidence"; summary?: boolean }
  | { action: "llm_analyze"; input: string; prompt: string }
  | { action: "agentic"; goal: string; agent?: string };

export interface SkillConfig {
  name: string;
  description?: string;
  agent?: string;
  steps: SkillStep[];
  triggers?: string[];
}

// ── Agents ──────────────────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  description?: string;
  model: string;
  system_prompt: string;
  tools?: string[];
  max_iterations?: number;
}

// ── Tools ───────────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description?: string;
  command: string;
  working_dir: string;
  timeout_sec: number;
  guard?: { require_confirmation: boolean; message?: string };
  success_patterns?: string[];
  failure_patterns?: string[];
}

// ── Memory Analysis ─────────────────────────────────────────────────

export interface SizeOutput {
  text: number;
  data: number;
  bss: number;
  total: number;
}

export interface MemoryReport {
  flash_used: number;
  flash_total: number;
  ram_used: number;
  ram_total: number;
  flash_percent: number;
  ram_percent: number;
}

// ── Agentic Loop ────────────────────────────────────────────────────

export interface AgenticLoopConfig {
  provider: unknown;
  registry: unknown;
  systemPrompt: string;
  context: { cwd: string };
  maxIterations?: number;
  maxTokens?: number;
  temperature?: number;
  streaming?: boolean;
  onToolCall?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string, isError: boolean) => void;
  onTextOutput?: (text: string) => void;
  onTextDelta?: (delta: string) => void;
}

export interface AgenticLoopResult {
  messages: unknown[];
  finalText: string;
  toolCallCount: number;
  iterations: number;
}

// ── Bridge return type ──────────────────────────────────────────────

export interface FwaiLib {
  loadConfig(cwd?: string): Config;
  loadProject(cwd?: string): Project;
  loadTools(cwd?: string): ToolDef[];
  loadSkillMap(cwd?: string): Map<string, SkillConfig>;
  getSkill(name: string, cwd?: string): SkillConfig | undefined;
  loadAgentMap(cwd?: string): Map<string, AgentConfig>;
  getAgent(name: string, cwd?: string): AgentConfig | undefined;
  listRecentRuns(limit?: number, cwd?: string): string[];
  loadEvidence(runId: string, cwd?: string): Evidence | null;
  workspaceExists(cwd?: string): boolean;
  buildProjectContext(project: Project, compilerVersion?: string): { name: string; mcu: string };
  formatContextBlock(ctx: { name: string; mcu: string }): string;
  parseSizeOutput(output: string): SizeOutput | null;
  parseSizeString?(s: string): number;
  computeMemoryReport(sizeOutput: SizeOutput, flashTotal: number, ramTotal: number): MemoryReport;
  createProvider(config: ProviderConfig): Promise<unknown>;
  runAgenticLoop(userMessage: string, history: unknown[], config: AgenticLoopConfig): Promise<AgenticLoopResult>;
  createAgentLoopConfig(agent: AgentConfig, opts: Record<string, unknown>): AgenticLoopConfig;
  checkChangeBudget(policy: Policy, cwd?: string, provider?: unknown): Promise<unknown>;
  checkProtectedPaths(changedFiles: string[], protectedPaths: string[]): string[];
  ToolRegistry: { createDefault(firmwareTools?: unknown): unknown; };
}
