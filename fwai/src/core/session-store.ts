/**
 * Session persistence — save/resume REPL conversation history.
 * Sessions stored as JSONL in .fwai/sessions/{sessionId}.jsonl
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ToolMessage } from "../providers/tool-types.js";
import { getWorkspaceDir } from "../utils/paths.js";

export interface SessionInfo {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

function sessionsDir(cwd?: string): string {
  return path.join(getWorkspaceDir(cwd), "sessions");
}

/**
 * Reject any session id that isn't a bare filename token. Ids flow in from raw
 * CLI arguments, so without this a value like `../../etc/foo` would let
 * loadSession/appendMessage/deleteSession escape the sessions directory.
 */
function assertSafeSessionId(sessionId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
}

function sessionPath(sessionId: string, cwd?: string): string {
  assertSafeSessionId(sessionId);
  return path.join(sessionsDir(cwd), `${sessionId}.jsonl`);
}

/** Generate a new session ID */
export function newSessionId(): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  const rand = crypto.randomBytes(3).toString("hex");
  return `${ts}-${rand}`;
}

/** Append a message to a session file */
export function appendMessage(sessionId: string, message: ToolMessage, cwd?: string): void {
  const dir = sessionsDir(cwd);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = sessionPath(sessionId, cwd);
  const line = JSON.stringify({
    ...message,
    timestamp: new Date().toISOString(),
  });
  fs.appendFileSync(filePath, line + "\n");
}

/** Load all messages from a session */
export function loadSession(sessionId: string, cwd?: string): ToolMessage[] {
  const filePath = sessionPath(sessionId, cwd);
  if (!fs.existsSync(filePath)) return [];

  const lines = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());

  // Skip malformed lines instead of throwing — a single corrupt line (e.g. an
  // interrupted append) would otherwise make the whole session unrecoverable.
  const messages: ToolMessage[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      messages.push({ role: parsed.role, content: parsed.content });
    } catch {
      // Ignore unparseable line and keep loading the rest.
    }
  }
  return messages;
}

/** List all sessions, most recent first */
export function listSessions(cwd?: string): SessionInfo[] {
  const dir = sessionsDir(cwd);
  if (!fs.existsSync(dir)) return [];

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse();

  return files.map((f) => {
    const id = f.replace(".jsonl", "");
    const filePath = path.join(dir, f);
    const stat = fs.statSync(filePath);
    const lines = fs
      .readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    return {
      id,
      createdAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
      messageCount: lines.length,
    };
  });
}

/** Delete a session. Returns true if a session file was actually removed. */
export function deleteSession(sessionId: string, cwd?: string): boolean {
  const filePath = sessionPath(sessionId, cwd);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
