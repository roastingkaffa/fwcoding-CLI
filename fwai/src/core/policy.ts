import { execSync } from "node:child_process";
import path from "node:path";
import { minimatch } from "minimatch";
import type { Policy } from "../schemas/config.schema.js";
import type { LLMProvider } from "../providers/provider.js";
import { loadEvidence, listRecentRuns } from "./evidence.js";
import { isGitRepo } from "./diff.js";
import { globalTracer } from "../utils/llm-tracer.js";
import * as log from "../utils/logger.js";
import { PolicyViolationError } from "../utils/errors.js";

export interface FileChange {
  file: string;
  added: number;
  removed: number;
}

export interface SplitSuggestion {
  label: string;
  files: string[];
  lines: number;
}

export interface BudgetCheckResult {
  withinBudget: boolean;
  filesChanged: number;
  linesChanged: number;
  maxFiles: number;
  maxLines: number;
  fileBreakdown: FileChange[];
  suggestedSplits?: SplitSuggestion[];
}

/** Check if a path is protected */
export function isProtectedPath(filePath: string, protectedPaths: string[]): boolean {
  return protectedPaths.some((pattern) => minimatch(filePath, pattern));
}

/** Check all protected paths against a list of changed files */
export function checkProtectedPaths(changedFiles: string[], protectedPaths: string[]): string[] {
  return changedFiles.filter((f) => isProtectedPath(f, protectedPaths));
}

/** Check git diff against change budget */
export async function checkChangeBudget(
  policy: Policy,
  cwd?: string,
  provider?: LLMProvider | null
): Promise<BudgetCheckResult> {
  const maxFiles = policy.change_budget.max_files_changed;
  const maxLines = policy.change_budget.max_lines_changed;

  if (!isGitRepo(cwd)) {
    return {
      withinBudget: true,
      filesChanged: 0,
      linesChanged: 0,
      maxFiles,
      maxLines,
      fileBreakdown: [],
    };
  }

  const fileBreakdown = parseGitDiffNumstat(cwd);
  const filesChanged = fileBreakdown.length;
  const linesChanged = fileBreakdown.reduce((sum, f) => sum + f.added + f.removed, 0);

  const withinBudget = filesChanged <= maxFiles && linesChanged <= maxLines;

  const result: BudgetCheckResult = {
    withinBudget,
    filesChanged,
    linesChanged,
    maxFiles,
    maxLines,
    fileBreakdown,
  };

  if (!withinBudget) {
    // Try LLM-powered smart splitting, fall back to directory-based
    result.suggestedSplits = await generateSmartSplitSuggestions(fileBreakdown, maxLines, provider);
  }

  return result;
}

/** Display budget check result to console */
export function displayBudgetResult(result: BudgetCheckResult): void {
  if (result.withinBudget) {
    log.success(
      `Change budget: ${result.filesChanged}/${result.maxFiles} files, ` +
        `${result.linesChanged}/${result.maxLines} lines`
    );
    return;
  }

  log.error("Change budget EXCEEDED:");
  log.output(
    `  Files:  ${result.filesChanged} / ${result.maxFiles} ${result.filesChanged > result.maxFiles ? "(exceeded)" : ""}`
  );
  log.output(
    `  Lines:  ${result.linesChanged} / ${result.maxLines} ${result.linesChanged > result.maxLines ? "(exceeded)" : ""}`
  );

  // File-by-file breakdown
  log.output("");
  log.heading("  File breakdown:");
  for (const f of result.fileBreakdown) {
    const total = f.added + f.removed;
    log.output(
      `    +${String(f.added).padEnd(4)} -${String(f.removed).padEnd(4)} (${total})  ${f.file}`
    );
  }

  // Split suggestions
  if (result.suggestedSplits && result.suggestedSplits.length > 1) {
    log.output("");
    log.heading("  Suggested split:");
    for (let i = 0; i < result.suggestedSplits.length; i++) {
      const split = result.suggestedSplits[i];
      log.output(`    Patch ${i + 1}: ${split.label} (~${split.lines} lines)`);
      for (const f of split.files) {
        log.output(`      - ${f}`);
      }
    }
  }
}

/** Check flash guard: requires last build to be successful */
export function checkFlashGuard(cwd?: string): boolean {
  const runs = listRecentRuns(10, cwd);
  for (const runId of runs) {
    const evidence = loadEvidence(runId, cwd);
    if (!evidence) continue;
    const buildResult = evidence.tools.find((t) => t.tool === "build");
    if (buildResult) {
      return buildResult.status === "success";
    }
  }
  log.warn("No previous build found. Flash guard check failed.");
  return false;
}

/** Parse git diff --numstat for per-file change counts */
function parseGitDiffNumstat(cwd?: string): FileChange[] {
  try {
    const output = execSync("git diff HEAD --numstat", {
      cwd: cwd ?? process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const files: FileChange[] = [];
    for (const line of output.trim().split("\n")) {
      if (!line) continue;
      const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
      if (match) {
        files.push({
          file: match[3],
          added: match[1] === "-" ? 0 : parseInt(match[1], 10),
          removed: match[2] === "-" ? 0 : parseInt(match[2], 10),
        });
      }
    }
    return files;
  } catch {
    return [];
  }
}

/** Use LLM to semantically group files, falling back to directory-based splitting */
export async function generateSmartSplitSuggestions(
  files: FileChange[],
  maxLinesPerPatch: number,
  provider?: LLMProvider | null
): Promise<SplitSuggestion[]> {
  if (!provider?.isReady() || files.length === 0) {
    return generateSplitSuggestions(files, maxLinesPerPatch);
  }

  const fileList = files.map((f) => `${f.file} (+${f.added} -${f.removed})`).join("\n");

  const prompt =
    `You are a firmware code reviewer. Group these changed files into logical, ` +
    `related patches (e.g., header/impl pairs, driver/config pairs, test groups).\n\n` +
    `Changed files:\n${fileList}\n\n` +
    `Max lines per patch: ${maxLinesPerPatch}\n\n` +
    `Respond with ONLY a JSON array, no markdown fences:\n` +
    `[{"label": "short description", "files": ["file1", "file2"]}]\n` +
    `Every file must appear in exactly one group.`;

  const timer = globalTracer.startCall("smart_split");
  try {
    const response = await provider.complete({
      messages: [{ role: "user", content: prompt }],
      system: "You are a code review assistant. Respond only with valid JSON.",
      max_tokens: 1024,
      temperature: 0,
    });

    timer.finish(response.usage.input_tokens, response.usage.output_tokens, {
      purpose: "smart_split",
    });

    // Parse and validate the LLM response
    const parsed = JSON.parse(response.content.trim()) as Array<{
      label: string;
      files: string[];
    }>;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new PolicyViolationError("LLM returned empty or non-array response", "llm_grouping");
    }

    // Validate every file is accounted for
    const allFiles = new Set(files.map((f) => f.file));
    const groupedFiles = new Set(parsed.flatMap((g) => g.files));

    for (const f of allFiles) {
      if (!groupedFiles.has(f)) {
        throw new PolicyViolationError(`File "${f}" missing from LLM grouping`, "llm_grouping");
      }
    }

    // Build SplitSuggestion[] with computed line counts
    const fileMap = new Map(files.map((f) => [f.file, f]));
    return parsed.map((group) => ({
      label: group.label,
      files: group.files,
      lines: group.files.reduce((sum, name) => {
        const fc = fileMap.get(name);
        return sum + (fc ? fc.added + fc.removed : 0);
      }, 0),
    }));
  } catch (err) {
    // Silent fallback to directory-based splitting
    log.debug(`Smart split fallback: ${err instanceof Error ? err.message : String(err)}`);
    return generateSplitSuggestions(files, maxLinesPerPatch);
  }
}

/** Group files by top-level directory and generate split suggestions */
function generateSplitSuggestions(
  files: FileChange[],
  maxLinesPerPatch: number
): SplitSuggestion[] {
  // Group by top-level directory
  const groups = new Map<string, FileChange[]>();

  for (const file of files) {
    const parts = file.file.split(path.sep);
    const group = parts.length > 1 ? parts[0] : "(root)";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(file);
  }

  // Build suggestions from groups
  const suggestions: SplitSuggestion[] = [];
  for (const [dir, groupFiles] of groups) {
    const totalLines = groupFiles.reduce((sum, f) => sum + f.added + f.removed, 0);

    // If the group itself exceeds budget, split further by subdirectory
    if (totalLines > maxLinesPerPatch && groupFiles.length > 1) {
      const subGroups = new Map<string, FileChange[]>();
      for (const f of groupFiles) {
        const parts = f.file.split(path.sep);
        const subKey = parts.length > 2 ? `${parts[0]}/${parts[1]}` : dir;
        if (!subGroups.has(subKey)) subGroups.set(subKey, []);
        subGroups.get(subKey)!.push(f);
      }
      for (const [subDir, subFiles] of subGroups) {
        const lines = subFiles.reduce((sum, f) => sum + f.added + f.removed, 0);
        suggestions.push({
          label: subDir,
          files: subFiles.map((f) => f.file),
          lines,
        });
      }
    } else {
      suggestions.push({
        label: dir,
        files: groupFiles.map((f) => f.file),
        lines: totalLines,
      });
    }
  }

  return suggestions.sort((a, b) => b.lines - a.lines);
}
