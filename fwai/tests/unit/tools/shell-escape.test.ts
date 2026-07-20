import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { shellQuote } from "../../../src/tools/shell-escape.js";

describe("shellQuote", () => {
  it("wraps a plain value in single quotes", () => {
    assert.equal(shellQuote("foo"), "'foo'");
  });

  it("escapes embedded single quotes", () => {
    assert.equal(shellQuote("a'b"), "'a'\\''b'");
  });

  // The whole point: an injection attempt must survive as one literal argument.
  it("neutralizes a command-injection payload", () => {
    const payload = "x'; touch /tmp/pwned; '";
    // Echo the quoted value back through /bin/sh and confirm it round-trips
    // as a single literal argument (no command substitution / breakout).
    const out = execFileSync("/bin/sh", ["-c", `printf %s ${shellQuote(payload)}`], {
      encoding: "utf-8",
    });
    assert.equal(out, payload);
  });
});
