import path from "node:path";
import fs from "node:fs";
import type { AppContext } from "../repl.js";
import { generateSigningKeyPair, verifyEvidenceSignature } from "../core/evidence-signer.js";
import { createScanner, scanFile } from "../core/secret-scanner.js";
import { auditNpmDependencies, verifyAllPlugins } from "../core/supply-chain.js";
import { loadEvidence, listRecentRuns } from "../core/evidence.js";
import { workspacePath } from "../utils/paths.js";
import * as log from "../utils/logger.js";

export async function handleSecurity(args: string, ctx: AppContext): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0] || "help";

  switch (sub) {
    case "keygen": {
      const outputDir = workspacePath("keys");
      const { privateKeyPath, publicKeyPath } = generateSigningKeyPair(outputDir);
      log.success(`Key pair generated:`);
      log.info(`  Private: ${privateKeyPath}`);
      log.info(`  Public:  ${publicKeyPath}`);
      break;
    }
    case "verify": {
      const runId = parts[1];
      if (!runId) {
        log.error("Usage: /security verify <run-id>");
        return;
      }
      const evidence = loadEvidence(runId);
      if (!evidence) {
        log.error(`Evidence not found for run: ${runId}`);
        return;
      }
      const result = verifyEvidenceSignature(evidence);
      if (result.valid) log.success(`Signature valid for ${runId}`);
      else log.error(`Signature invalid for ${runId}: ${result.error ?? "verification failed"}`);
      break;
    }
    case "verify-all": {
      const runs = listRecentRuns(100);
      let valid = 0,
        invalid = 0,
        unsigned = 0;
      for (const runId of runs) {
        const evidence = loadEvidence(runId);
        if (!evidence) continue;
        if (!evidence.signature) {
          unsigned++;
          continue;
        }
        const result = verifyEvidenceSignature(evidence);
        if (result.valid) valid++;
        else invalid++;
      }
      log.info(
        `Verification: ${valid} valid, ${invalid} invalid, ${unsigned} unsigned (${runs.length} total)`
      );
      break;
    }
    case "scan": {
      const scanner = createScanner(ctx.config.security?.secret_patterns);
      const cwd = process.cwd();
      const srcDir = path.join(cwd, "src");
      if (!fs.existsSync(srcDir)) {
        log.warn("No src/ directory found");
        return;
      }
      let totalSecrets = 0;
      const files = collectSourceFiles(srcDir);
      for (const file of files) {
        const result = scanFile(file, scanner);
        if (result.redactedCount > 0) {
          log.warn(`${path.relative(cwd, file)}: ${result.redactedCount} secret(s) found`);
          totalSecrets += result.redactedCount;
        }
      }
      if (totalSecrets === 0) log.success("No secrets found in source files");
      else log.warn(`Total: ${totalSecrets} secret(s) across ${files.length} files`);
      break;
    }
    case "audit-deps": {
      const cwd = process.cwd();
      log.info("Running npm audit...");
      const audit = auditNpmDependencies(cwd);
      if (audit.total > 0) {
        for (const v of audit.vulnerabilities) log.warn(`  ${v.name} (${v.severity})`);
      } else {
        log.success("No npm vulnerabilities found");
      }
      log.info("Checking plugin integrity...");
      const plugins = verifyAllPlugins(cwd);
      for (const p of plugins) {
        if (p.valid) log.success(`  ${p.name}: integrity OK`);
        else log.error(`  ${p.name}: INTEGRITY MISMATCH`);
      }
      if (plugins.length === 0) log.info("  No plugins installed");
      break;
    }
    default:
      log.info("Usage: /security <keygen|verify|verify-all|scan|audit-deps>");
  }
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules")
      files.push(...collectSourceFiles(full));
    else if (/\.(ts|js|c|h|cpp|py|yaml|yml|json)$/.test(entry.name)) files.push(full);
  }
  return files;
}
