/**
 * CLI runner — spawns fwai CLI as a child process for execution commands.
 */

import { spawn } from "node:child_process";
import * as vscode from "vscode";

export interface FwaiRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  json?: unknown;
}

function getCliPath(): string {
  return vscode.workspace.getConfiguration("fwai").get("cliPath", "fwai");
}

export function spawnFwai(args: string[], cwd: string): Promise<FwaiRunResult> {
  return new Promise((resolve) => {
    const proc = spawn(getCliPath(), args, { cwd, env: { ...process.env, NO_COLOR: "1" } });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      let json: unknown;
      try { json = JSON.parse(stdout); } catch { /* not JSON */ }
      resolve({ exitCode: code ?? 1, stdout, stderr, json });
    });
    proc.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: err.message, json: undefined });
    });
  });
}

export function runFwaiSkill(skill: string, cwd: string): Promise<FwaiRunResult> {
  return spawnFwai(["run", skill, "--json"], cwd);
}

export function runFwaiCommand(cmd: string, cwd: string): Promise<FwaiRunResult> {
  return spawnFwai(cmd.split(/\s+/), cwd);
}
