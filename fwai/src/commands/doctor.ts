import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AppContext } from "../repl.js";
import { workspaceExists, getWorkspaceDir } from "../utils/paths.js";
import { isGitRepo } from "../core/diff.js";
import { loadConfig, loadProject } from "../core/config-loader.js";
import * as log from "../utils/logger.js";

interface CheckResult {
  name: string;
  status: "ok" | "fail" | "warn";
  detail: string;
}

interface DoctorCache {
  timestamp: string;
  versions: Record<string, string>;
}

function checkBinary(name: string, versionFlag = "--version"): CheckResult & { version?: string } {
  try {
    const output = execSync(`${name} ${versionFlag} 2>&1`, {
      encoding: "utf-8",
      timeout: 5000,
    });
    const version = output.split("\n")[0].trim().slice(0, 60);
    return { name, status: "ok", detail: version, version };
  } catch {
    return { name, status: "fail", detail: "not found" };
  }
}

function checkEnvVar(varName: string): CheckResult {
  const value = process.env[varName];
  if (value) {
    return { name: varName, status: "ok", detail: "set" };
  }
  return { name: varName, status: "warn", detail: "not set (LLM features disabled)" };
}

function checkPath(filePath: string, label: string): CheckResult {
  if (fs.existsSync(filePath)) {
    return { name: label, status: "ok", detail: "accessible" };
  }
  return { name: label, status: "warn", detail: "not found" };
}

/** Load cached doctor results */
function loadDoctorCache(cwd?: string): DoctorCache | null {
  try {
    const cacheDir = path.join(getWorkspaceDir(cwd), "logs");
    const cachePath = path.join(cacheDir, "doctor-cache.json");
    if (!fs.existsSync(cachePath)) return null;
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  } catch {
    return null;
  }
}

/** Save doctor cache */
function saveDoctorCache(cache: DoctorCache, cwd?: string): void {
  try {
    const cacheDir = path.join(getWorkspaceDir(cwd), "logs");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, "doctor-cache.json");
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch {
    // Ignore cache write failures
  }
}

/** Validate config.yaml with zod */
function validateConfig(cwd?: string): CheckResult {
  try {
    loadConfig(cwd);
    return { name: "config.yaml", status: "ok", detail: "valid" };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0].slice(0, 60) : "invalid";
    return { name: "config.yaml", status: "fail", detail: msg };
  }
}

/** Validate project.yaml with zod */
function validateProject(cwd?: string): CheckResult {
  try {
    loadProject(cwd);
    return { name: "project.yaml", status: "ok", detail: "valid" };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0].slice(0, 60) : "invalid";
    return { name: "project.yaml", status: "fail", detail: msg };
  }
}

export async function handleDoctor(_args: string, ctx: AppContext): Promise<void> {
  log.heading("\nFirmware AI CLI — Environment Check\n");
  log.line();

  const checks: CheckResult[] = [];
  const versions: Record<string, string> = {};

  // Core tools
  const gitCheck = checkBinary("git");
  checks.push(gitCheck);
  if (gitCheck.version) versions["git"] = gitCheck.version;

  const nodeCheck = checkBinary("node");
  checks.push(nodeCheck);
  if (nodeCheck.version) versions["node"] = nodeCheck.version;

  // Git repo check
  checks.push({
    name: "git repo",
    status: isGitRepo() ? "ok" : "warn",
    detail: isGitRepo() ? "inside git repository" : "not a git repo (diff/budget features disabled)",
  });

  // Workspace
  checks.push({
    name: ".fwai/",
    status: workspaceExists() ? "ok" : "fail",
    detail: workspaceExists() ? "found" : "not found — run fwai init",
  });

  // YAML validation
  checks.push(validateConfig());
  checks.push(validateProject());

  // Toolchain from project.yaml
  const toolchain = ctx.project.project.toolchain;
  const compilerCheck = checkBinary(toolchain.compiler);
  checks.push(compilerCheck);
  if (compilerCheck.version) versions[toolchain.compiler] = compilerCheck.version;

  if (toolchain.debugger) {
    const dbgCheck = checkBinary(toolchain.debugger);
    checks.push(dbgCheck);
    if (dbgCheck.version) versions[toolchain.debugger] = dbgCheck.version;
  }
  if (toolchain.flasher && toolchain.flasher !== toolchain.debugger) {
    const flashCheck = checkBinary(toolchain.flasher);
    checks.push(flashCheck);
    if (flashCheck.version) versions[toolchain.flasher] = flashCheck.version;
  }

  // Serial port
  checks.push(checkPath(ctx.project.project.serial.port, ctx.project.project.serial.port));

  // LLM API key
  checks.push(checkEnvVar(ctx.config.provider.api_key_env));

  // Display results
  let warns = 0;
  let fails = 0;
  for (const check of checks) {
    const icon =
      check.status === "ok" ? "  ✓" : check.status === "warn" ? "  ⚠" : "  ✗";
    console.log(`${icon}  ${check.name.padEnd(24)} ${check.detail}`);
    if (check.status === "warn") warns++;
    if (check.status === "fail") fails++;
  }

  // Save compiler version cache
  const cache: DoctorCache = {
    timestamp: new Date().toISOString(),
    versions,
  };
  saveDoctorCache(cache);

  // Show cache status
  const prev = loadDoctorCache();
  if (prev) {
    log.debug(`Doctor cache updated (previous: ${prev.timestamp})`);
  }

  log.line();
  if (fails > 0) {
    log.error(`NOT READY (${fails} failed, ${warns} warnings)`);
  } else if (warns > 0) {
    log.success(`READY (${warns} warnings)`);
  } else {
    log.success("READY");
  }
  console.log("");
}
