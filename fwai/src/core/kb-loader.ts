/**
 * Knowledge Base loader and search.
 *
 * Walks .fwai/kb/ for .md/.txt files, indexes them for keyword search,
 * and formats matching content for system prompt injection.
 */

import fs from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";
import { getWorkspaceDir } from "../utils/paths.js";
import type { KBDocument, KBConfig } from "../schemas/kb.schema.js";

/**
 * Load all KB documents from .fwai/kb/ directory.
 */
export function loadKBDocuments(cwd?: string, config?: KBConfig): KBDocument[] {
  const kbDir = path.join(getWorkspaceDir(cwd), "kb");
  if (!fs.existsSync(kbDir)) return [];

  const include = config?.include ?? ["**/*.md", "**/*.txt"];
  const exclude = config?.exclude ?? [];
  const documents: KBDocument[] = [];

  walkDir(kbDir, kbDir, include, exclude, documents);
  return documents;
}

function walkDir(
  baseDir: string,
  currentDir: string,
  include: string[],
  exclude: string[],
  results: KBDocument[]
): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      walkDir(baseDir, fullPath, include, exclude, results);
      continue;
    }

    if (!entry.isFile()) continue;

    // Check include patterns
    const included = include.some((p) => minimatch(relativePath, p));
    if (!included) continue;

    // Check exclude patterns
    const excluded = exclude.some((p) => minimatch(relativePath, p));
    if (excluded) continue;

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      // Rough token estimate: ~4 chars per token
      const tokensEstimate = Math.ceil(content.length / 4);

      // Extract title from first line or filename
      const firstLine = content.split("\n")[0]?.trim() ?? "";
      const title = firstLine.startsWith("#")
        ? firstLine.replace(/^#+\s*/, "")
        : path.basename(relativePath, path.extname(relativePath));

      results.push({
        path: relativePath,
        title,
        content,
        tokens_estimate: tokensEstimate,
      });
    } catch {
      // Skip unreadable files
    }
  }
}

/**
 * Search KB documents by keyword scoring.
 * Returns documents sorted by relevance (highest score first).
 */
export function searchKB(
  query: string,
  documents: KBDocument[]
): Array<KBDocument & { score: number }> {
  if (!query.trim() || documents.length === 0) return [];

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2); // Skip short words

  if (keywords.length === 0) return [];

  const scored = documents
    .map((doc) => {
      const searchText = (doc.title + " " + doc.content).toLowerCase();
      let score = 0;

      for (const kw of keywords) {
        // Count occurrences
        let idx = 0;
        let count = 0;
        while ((idx = searchText.indexOf(kw, idx)) !== -1) {
          count++;
          idx += kw.length;
        }
        score += count;

        // Bonus for title match
        if (doc.title.toLowerCase().includes(kw)) {
          score += 5;
        }
      }

      return { ...doc, score };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * Format KB search results for system prompt injection.
 * Respects max_context_tokens budget.
 */
export function formatKBContext(
  results: Array<KBDocument & { score: number }>,
  maxTokens = 4000
): string {
  if (results.length === 0) return "";

  const lines: string[] = ["## Knowledge Base Context (auto-injected)", ""];

  let totalTokens = 20; // Header overhead

  for (const doc of results) {
    const tokensNeeded = doc.tokens_estimate ?? Math.ceil(doc.content.length / 4);
    if (totalTokens + tokensNeeded > maxTokens) {
      // Try to include a truncated version
      const remainingChars = (maxTokens - totalTokens) * 4;
      if (remainingChars > 200) {
        lines.push(`### ${doc.title} (${doc.path}) [truncated]`);
        lines.push(doc.content.slice(0, remainingChars) + "\n...(truncated)");
        lines.push("");
      }
      break;
    }

    lines.push(`### ${doc.title} (${doc.path})`);
    lines.push(doc.content);
    lines.push("");
    totalTokens += tokensNeeded;
  }

  return lines.join("\n");
}
