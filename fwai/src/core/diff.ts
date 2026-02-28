import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Changes } from "../schemas/evidence.schema.js";
import * as log from "../utils/logger.js";

export interface DiffResult {
  patchPath: string | null;
  changes: Changes | null;
}

/** Check if cwd is inside a git repo */
export function isGitRepo(cwd?: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: cwd ?? process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/** Get current git branch name */
export function getGitBranch(cwd?: string): string | undefined {
  try {
    return (
      execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: cwd ?? process.cwd(),
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

/** Get current git commit short hash */
export function getGitCommit(cwd?: string): string | undefined {
  try {
    return (
      execSync("git rev-parse --short HEAD", {
        cwd: cwd ?? process.cwd(),
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

/** Generate diff.patch and parse change stats. Returns null for both if no changes or not a git repo. */
export function generateDiff(runDir: string, cwd?: string): DiffResult {
  const workDir = cwd ?? process.cwd();

  if (!isGitRepo(workDir)) {
    log.debug("Not a git repo, skipping diff");
    return { patchPath: null, changes: null };
  }

  try {
    // Generate diff patch (staged + unstaged)
    const diff = execSync("git diff HEAD", {
      cwd: workDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!diff.trim()) {
      return { patchPath: null, changes: null };
    }

    const patchPath = path.join(runDir, "diff.patch");
    fs.writeFileSync(patchPath, diff);

    // Parse diff stat
    const stat = execSync("git diff HEAD --stat --numstat", {
      cwd: workDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const { filesChanged, linesAdded, linesRemoved } = parseDiffNumstat(stat);

    const changes: Changes = {
      files_changed: filesChanged,
      lines_added: linesAdded,
      lines_removed: linesRemoved,
      diff_path: "diff.patch",
      within_budget: true, // Will be set by policy engine
    };

    log.debug(`Diff: ${filesChanged} files, +${linesAdded}/-${linesRemoved}`);
    return { patchPath, changes };
  } catch (err) {
    log.debug(`git diff failed: ${err}`);
    return { patchPath: null, changes: null };
  }
}

/** Get list of changed files from git */
export function getChangedFiles(cwd?: string): string[] {
  try {
    const output = execSync("git diff HEAD --name-only", {
      cwd: cwd ?? process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Parse git diff --numstat output into totals */
function parseDiffNumstat(numstat: string): {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
} {
  let filesChanged = 0;
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const line of numstat.trim().split("\n")) {
    const match = line.match(/^(\d+)\s+(\d+)\s+/);
    if (match) {
      linesAdded += parseInt(match[1], 10);
      linesRemoved += parseInt(match[2], 10);
      filesChanged++;
    }
  }

  return { filesChanged, linesAdded, linesRemoved };
}
