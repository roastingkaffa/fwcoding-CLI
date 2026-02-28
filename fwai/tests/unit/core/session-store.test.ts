import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  newSessionId,
  appendMessage,
  loadSession,
  listSessions,
  deleteSession,
} from "../../../src/core/session-store.js";

describe("session-store", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-test-"));
    // Create .fwai directory structure
    fs.mkdirSync(path.join(tmpDir, ".fwai"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates unique session IDs", () => {
    const id1 = newSessionId();
    const id2 = newSessionId();
    assert.notEqual(id1, id2);
    assert.ok(id1.length > 10);
  });

  it("appends and loads messages", () => {
    const id = "test-session-1";
    appendMessage(id, { role: "user", content: "Hello" }, tmpDir);
    appendMessage(id, { role: "assistant", content: "Hi there" }, tmpDir);

    const messages = loadSession(id, tmpDir);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[0].content, "Hello");
    assert.equal(messages[1].role, "assistant");
    assert.equal(messages[1].content, "Hi there");
  });

  it("returns empty array for non-existent session", () => {
    const messages = loadSession("nonexistent", tmpDir);
    assert.equal(messages.length, 0);
  });

  it("lists sessions", () => {
    appendMessage("session-a", { role: "user", content: "A" }, tmpDir);
    appendMessage("session-b", { role: "user", content: "B" }, tmpDir);

    const sessions = listSessions(tmpDir);
    assert.equal(sessions.length, 2);
    assert.ok(sessions.some((s) => s.id === "session-a"));
    assert.ok(sessions.some((s) => s.id === "session-b"));
  });

  it("deletes a session", () => {
    appendMessage("to-delete", { role: "user", content: "bye" }, tmpDir);
    assert.equal(listSessions(tmpDir).length, 1);

    deleteSession("to-delete", tmpDir);
    assert.equal(listSessions(tmpDir).length, 0);
  });
});
