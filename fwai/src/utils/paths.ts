import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve .fwai/ workspace root from cwd */
export function getWorkspaceDir(cwd?: string): string {
  return path.join(cwd ?? process.cwd(), ".fwai");
}

/** Check if .fwai/ exists */
export function workspaceExists(cwd?: string): boolean {
  return fs.existsSync(getWorkspaceDir(cwd));
}

/** Resolve a path relative to workspace */
export function workspacePath(relative: string, cwd?: string): string {
  return path.join(getWorkspaceDir(cwd), relative);
}

/** Resolve a path relative to project root */
export function projectPath(relative: string, cwd?: string): string {
  return path.join(cwd ?? process.cwd(), relative);
}

/** Get the runs directory */
export function getRunsDir(cwd?: string): string {
  return workspacePath("runs", cwd);
}

/** Generate a timestamped run directory name */
export function generateRunId(label: string): string {
  const now = new Date();
  const ts = now
    .toISOString()
    .replace(/[-:T.]/g, "")
    .slice(0, 14);
  const formatted = `${ts.slice(0, 8)}-${ts.slice(8)}`;
  return `${formatted}-${label}`;
}

/** Get the templates directory (relative to package install) */
export function getTemplatesDir(): string {
  // __dirname = dist/utils/, templates is at project root
  return path.join(__dirname, "..", "..", "templates");
}
