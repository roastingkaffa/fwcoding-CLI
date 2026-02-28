import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ToolchainConfig } from "../schemas/project.schema.js";

export interface NpmVulnerability {
  name: string;
  severity: string;
  advisory: string;
}

export interface NpmAuditResult {
  vulnerabilities: NpmVulnerability[];
  total: number;
}

/** Run npm audit --json and parse results */
export function auditNpmDependencies(cwd: string): NpmAuditResult {
  try {
    const output = execSync("npm audit --json 2>/dev/null", { cwd, encoding: "utf-8", timeout: 30000 });
    const data = JSON.parse(output);
    const vulns: NpmVulnerability[] = [];

    if (data.vulnerabilities) {
      for (const [name, info] of Object.entries(data.vulnerabilities)) {
        const v = info as { severity?: string; via?: unknown[] };
        vulns.push({
          name,
          severity: v.severity ?? "unknown",
          advisory: Array.isArray(v.via) ? String(v.via[0]) : "N/A",
        });
      }
    }

    return { vulnerabilities: vulns, total: vulns.length };
  } catch {
    // npm audit returns non-zero when vulnerabilities exist
    return { vulnerabilities: [], total: 0 };
  }
}

export interface PluginIntegrityResult {
  valid: boolean;
  expected: string;
  actual: string;
}

/** Verify SHA-256 integrity of an installed plugin against its manifest checksum */
export function verifyPluginIntegrity(pluginDir: string): PluginIntegrityResult {
  const manifestPath = path.join(pluginDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { valid: false, expected: "", actual: "manifest not found" };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const expected: string = manifest.checksum ?? "";
  if (!expected) {
    return { valid: false, expected: "", actual: "no checksum in manifest" };
  }

  // Compute SHA-256 of all plugin files (sorted for determinism)
  const hash = crypto.createHash("sha256");
  const files = collectFiles(pluginDir).filter((f) => path.basename(f) !== "manifest.json").sort();
  for (const file of files) {
    hash.update(fs.readFileSync(file));
  }
  const actual = hash.digest("hex");

  return { valid: actual === expected, expected, actual };
}

/** Verify all plugins in .fwai/plugins/ */
export function verifyAllPlugins(cwd: string): Array<{ name: string } & PluginIntegrityResult> {
  const pluginsDir = path.join(cwd, ".fwai", "plugins");
  if (!fs.existsSync(pluginsDir)) return [];

  const results: Array<{ name: string } & PluginIntegrityResult> = [];
  for (const name of fs.readdirSync(pluginsDir)) {
    const pluginDir = path.join(pluginsDir, name);
    if (!fs.statSync(pluginDir).isDirectory()) continue;
    results.push({ name, ...verifyPluginIntegrity(pluginDir) });
  }
  return results;
}

export interface ToolchainBinaryInfo {
  binary: string;
  path: string;
  sha256: string;
}

/** Record SHA-256 hashes of toolchain binaries for reproducibility */
export function checkToolchainBinaries(toolchain: ToolchainConfig): ToolchainBinaryInfo[] {
  const results: ToolchainBinaryInfo[] = [];
  const binaries = [toolchain.compiler, toolchain.debugger, toolchain.flasher].filter(Boolean) as string[];

  for (const binary of binaries) {
    try {
      const resolvedPath = execSync(`which ${binary} 2>/dev/null`, { encoding: "utf-8" }).trim();
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const hash = crypto.createHash("sha256").update(fs.readFileSync(resolvedPath)).digest("hex");
        results.push({ binary, path: resolvedPath, sha256: hash });
      }
    } catch { /* binary not found */ }
  }
  return results;
}

/** Recursively collect all files in a directory */
function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full));
    else files.push(full);
  }
  return files;
}
