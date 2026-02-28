import fs from "node:fs";
import type { Evidence } from "../schemas/evidence.schema.js";

/** Common secret patterns: API keys, tokens, passwords, PEM blocks, long hex secrets */
export const DEFAULT_SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "aws_key", re: /AKIA[0-9A-Z]{16}/g },
  { name: "openai_key", re: /sk-[A-Za-z0-9]{32,}/g },
  {
    name: "generic_token",
    re: /(?:token|bearer|authorization)[=:\s]+["']?[A-Za-z0-9\-_.]{20,}["']?/gi,
  },
  { name: "password_in_url", re: /:\/\/[^:]+:[^@]{8,}@/g },
  {
    name: "pem_block",
    re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g,
  },
  {
    name: "hex_secret",
    re: /(?:secret|key|password|passwd|pwd)[=:\s]+["']?[0-9a-fA-F]{32,}["']?/gi,
  },
  { name: "github_token", re: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
];

export interface ScanLocation {
  line: number;
  pattern: string;
}

export interface ScanResult {
  clean: string;
  redactedCount: number;
  locations: ScanLocation[];
}

export interface SecretScanner {
  scan(text: string): ScanResult;
  redact(text: string): string;
}

/** Create a scanner with default + optional custom patterns */
export function createScanner(customPatterns?: string[]): SecretScanner {
  const patterns = [...DEFAULT_SECRET_PATTERNS];
  if (customPatterns) {
    for (const p of customPatterns) {
      try {
        patterns.push({ name: "custom", re: new RegExp(p, "g") });
      } catch {
        /* skip invalid regex */
      }
    }
  }

  function scan(text: string): ScanResult {
    const locations: ScanLocation[] = [];
    let clean = text;
    let redactedCount = 0;

    for (const { name, re } of patterns) {
      const regex = new RegExp(re.source, re.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const line = text.slice(0, match.index).split("\n").length;
        locations.push({ line, pattern: name });
        redactedCount++;
      }
      clean = clean.replace(new RegExp(re.source, re.flags), `[REDACTED:${name}]`);
    }

    return { clean, redactedCount, locations };
  }

  function redact(text: string): string {
    return scan(text).clean;
  }

  return { scan, redact };
}

/** Scan a file for secrets */
export function scanFile(filePath: string, scanner: SecretScanner): ScanResult {
  const content = fs.readFileSync(filePath, "utf-8");
  return scanner.scan(content);
}

/** Scan and redact secrets from evidence tool commands and log references */
export function scanEvidence(
  evidence: Evidence,
  scanner: SecretScanner
): { evidence: Evidence; redactedCount: number } {
  let totalRedacted = 0;
  const redacted = { ...evidence };

  // Redact tool commands
  redacted.tools = evidence.tools.map((t) => {
    const result = scanner.scan(t.command);
    totalRedacted += result.redactedCount;
    return { ...t, command: result.clean };
  });

  return { evidence: redacted, redactedCount: totalRedacted };
}
