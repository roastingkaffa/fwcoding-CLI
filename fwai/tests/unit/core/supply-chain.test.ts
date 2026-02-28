import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { verifyPluginIntegrity, verifyAllPlugins } from "../../../src/core/supply-chain.js";
import crypto from "node:crypto";

describe("supply-chain", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-supply-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("verifies valid plugin integrity", () => {
    const pluginDir = path.join(tmpDir, "my-plugin");
    fs.mkdirSync(pluginDir, { recursive: true });

    // Create plugin files
    const toolContent = "tool: my-tool\ncommand: echo hello";
    fs.writeFileSync(path.join(pluginDir, "tool.yaml"), toolContent);

    // Compute expected checksum
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(path.join(pluginDir, "tool.yaml")));
    const checksum = hash.digest("hex");

    // Write manifest with matching checksum
    fs.writeFileSync(path.join(pluginDir, "manifest.json"), JSON.stringify({ checksum }));

    const result = verifyPluginIntegrity(pluginDir);
    assert.equal(result.valid, true);
    assert.equal(result.expected, checksum);
    assert.equal(result.actual, checksum);
  });

  it("detects tampered plugin", () => {
    const pluginDir = path.join(tmpDir, "tampered-plugin");
    fs.mkdirSync(pluginDir, { recursive: true });

    fs.writeFileSync(path.join(pluginDir, "tool.yaml"), "original content");
    fs.writeFileSync(path.join(pluginDir, "manifest.json"), JSON.stringify({ checksum: "deadbeef" }));

    const result = verifyPluginIntegrity(pluginDir);
    assert.equal(result.valid, false);
    assert.equal(result.expected, "deadbeef");
    assert.notEqual(result.actual, "deadbeef");
  });

  it("handles missing manifest gracefully", () => {
    const pluginDir = path.join(tmpDir, "no-manifest");
    fs.mkdirSync(pluginDir, { recursive: true });

    const result = verifyPluginIntegrity(pluginDir);
    assert.equal(result.valid, false);
    assert.ok(result.actual.includes("manifest not found"));
  });

  it("verifies all plugins in directory", () => {
    const pluginsDir = path.join(tmpDir, ".fwai", "plugins");

    // Valid plugin
    const validDir = path.join(pluginsDir, "valid-plugin");
    fs.mkdirSync(validDir, { recursive: true });
    fs.writeFileSync(path.join(validDir, "tool.yaml"), "content");
    const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(validDir, "tool.yaml"))).digest("hex");
    fs.writeFileSync(path.join(validDir, "manifest.json"), JSON.stringify({ checksum: hash }));

    // Invalid plugin
    const invalidDir = path.join(pluginsDir, "bad-plugin");
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(invalidDir, "tool.yaml"), "other content");
    fs.writeFileSync(path.join(invalidDir, "manifest.json"), JSON.stringify({ checksum: "wrong" }));

    const results = verifyAllPlugins(tmpDir);
    assert.equal(results.length, 2);
    const valid = results.find((r) => r.name === "valid-plugin");
    const invalid = results.find((r) => r.name === "bad-plugin");
    assert.ok(valid?.valid);
    assert.ok(!invalid?.valid);
  });
});
