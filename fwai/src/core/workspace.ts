import fs from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { getWorkspaceDir, workspaceExists, getTemplatesDir } from "../utils/paths.js";
import { loadConfig, loadProject } from "./config-loader.js";
import * as log from "../utils/logger.js";

/** Copy directory recursively */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export interface InitOptions {
  force?: boolean;
  cwd?: string;
}

/** Initialize .fwai/ workspace from templates */
export function initWorkspace(options: InitOptions = {}): void {
  const wsDir = getWorkspaceDir(options.cwd);

  if (workspaceExists(options.cwd)) {
    if (!options.force) {
      log.error(`.fwai/ already exists. Use --force to overwrite.`);
      process.exit(1);
    }
    log.warn("Overwriting existing .fwai/ directory (--force)");
    fs.rmSync(wsDir, { recursive: true, force: true });
  }

  const templatesDir = getTemplatesDir();
  const templateFwai = path.join(templatesDir, ".fwai");

  if (!fs.existsSync(templateFwai)) {
    log.error(`Templates not found at ${templateFwai}`);
    process.exit(1);
  }

  copyDirSync(templateFwai, wsDir);

  // Create empty runtime directories
  const runtimeDirs = ["runs", "logs", "mcp", "kb"];
  for (const dir of runtimeDirs) {
    fs.mkdirSync(path.join(wsDir, dir), { recursive: true });
  }

  // Post-init validation: parse generated YAML with zod schemas
  const errors: string[] = [];
  try {
    loadConfig(options.cwd);
  } catch (e) {
    if (e instanceof ZodError) {
      errors.push(
        `config.yaml validation failed:\n${e.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`
      );
    } else {
      errors.push(`config.yaml: ${e}`);
    }
  }
  try {
    loadProject(options.cwd);
  } catch (e) {
    if (e instanceof ZodError) {
      errors.push(
        `project.yaml validation failed:\n${e.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`
      );
    } else {
      errors.push(`project.yaml: ${e}`);
    }
  }

  if (errors.length > 0) {
    log.warn("Workspace created but template validation found issues:");
    for (const err of errors) {
      log.error(err);
    }
  }

  // Print file tree summary
  log.success("Initialized .fwai/ workspace");
  log.line();
  log.heading("Generated files:");
  console.log("  .fwai/");
  printFileTree(wsDir, "  ");
  log.line();

  log.info("Edit .fwai/project.yaml to configure your target hardware");
  log.info("Edit .fwai/config.yaml to set your LLM provider");
}

/** Print a tree-style listing of directory contents */
function printFileTree(dir: string, indent: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
    // Directories first, then files
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const nextIndent = indent + (isLast ? "    " : "│   ");
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const children = fs.readdirSync(fullPath);
      if (children.length === 0) {
        console.log(`${indent}${connector}${entry.name}/  (empty)`);
      } else {
        console.log(`${indent}${connector}${entry.name}/`);
        printFileTree(fullPath, nextIndent);
      }
    } else {
      console.log(`${indent}${connector}${entry.name}`);
    }
  }
}

/** Ensure workspace exists, exit with message if not */
export function requireWorkspace(cwd?: string): void {
  if (!workspaceExists(cwd)) {
    log.error("No .fwai/ workspace found. Run `fwai init` first.");
    process.exit(1);
  }
}
