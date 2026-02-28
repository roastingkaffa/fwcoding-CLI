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

function sessionPath(sessionId: string, cwd?: string): string {
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
    // Stringify content blocks for JSONL compat
    content: typeof message.content === "string" ? message.content : message.content,
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

  return lines.map((line) => {
    const parsed = JSON.parse(line);
    return { role: parsed.role, content: parsed.content };
  });
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

/** Delete a session */
export function deleteSession(sessionId: string, cwd?: string): void {
  const filePath = sessionPath(sessionId, cwd);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
