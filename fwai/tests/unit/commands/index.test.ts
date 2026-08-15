import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commands } from "../../../src/commands/index.js";

const commandsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src/commands"
);

describe("command registry", () => {
  it("registers every command handler module", () => {
    // Three handlers (memory, provider, farm) were fully implemented but never
    // added to `commands[]`, so typing /memory returned "Unknown command" while
    // the docs described the feature as working. Nothing caught it because a
    // handler that is never imported still compiles and still lints.
    const handlerFiles = fs
      .readdirSync(commandsDir)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts" && f !== "help.ts")
      .map((f) => f.replace(/\.ts$/, ""));

    const registered = new Set(commands.map((c) => c.name));
    // agent-chat.ts backs the /agent command — filename and command differ.
    const fileToCommand: Record<string, string> = { "agent-chat": "agent" };

    const orphans = handlerFiles.filter((f) => !registered.has(fileToCommand[f] ?? f));
    assert.deepEqual(
      orphans,
      [],
      `handler modules not reachable from the REPL: ${orphans.join(", ")}`
    );
  });

  it("has no duplicate command names", () => {
    const names = commands.map((c) => c.name);
    assert.equal(new Set(names).size, names.length);
  });

  it("gives every command a non-empty description for /help", () => {
    for (const cmd of commands) {
      assert.ok(cmd.description.trim().length > 0, `${cmd.name} has no description`);
      assert.equal(typeof cmd.handler, "function", `${cmd.name} has no handler`);
    }
  });

  it("does not register exit/quit, which routeCommand handles directly", () => {
    const names = commands.map((c) => c.name);
    assert.ok(!names.includes("exit"));
    assert.ok(!names.includes("quit"));
  });
});
