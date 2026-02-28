import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadInstalledPlugins, uninstallPlugin, loadPluginArtifacts } from "../../../src/core/plugin-loader.js";

describe("plugin-loader", () => {
  let tmpDir: string;
  let pluginsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-test-"));
    pluginsDir = path.join(tmpDir, ".fwai", "plugins");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no plugins directory exists", () => {
    const result = loadInstalledPlugins(tmpDir);
    assert.deepStrictEqual(result, []);
  });

  it("loads a plugin manifest from plugin.yaml", () => {
    const pluginDir = path.join(pluginsDir, "test-plugin");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "plugin.yaml"), `
name: test-plugin
version: "1.0.0"
description: A test plugin
author: test-author
`);
    const plugins = loadInstalledPlugins(tmpDir);
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0].name, "test-plugin");
    assert.equal(plugins[0].version, "1.0.0");
  });

  it("loads plugin tool artifacts", () => {
    const pluginDir = path.join(pluginsDir, "tools-plugin");
    const toolsDir = path.join(pluginDir, "tools");
    fs.mkdirSync(toolsDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "plugin.yaml"), `
name: tools-plugin
version: "1.0.0"
`);
    fs.writeFileSync(path.join(toolsDir, "custom.tool.yaml"), `
name: custom-build
description: Custom build tool
command: make all
working_dir: "."
timeout_sec: 60
`);
    const artifacts = loadPluginArtifacts(tmpDir);
    assert.equal(artifacts.tools.length, 1);
    assert.equal(artifacts.tools[0].name, "custom-build");
  });

  it("uninstalls a plugin by removing its directory", () => {
    const pluginDir = path.join(pluginsDir, "remove-me");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "plugin.yaml"), "name: remove-me\nversion: '1.0.0'\n");
    assert.ok(fs.existsSync(pluginDir));
    uninstallPlugin("remove-me", tmpDir);
    assert.ok(!fs.existsSync(pluginDir));
  });
});
