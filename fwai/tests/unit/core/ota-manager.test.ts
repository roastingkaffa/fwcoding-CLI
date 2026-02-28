import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { listBundles } from "../../../src/core/ota-manager.js";
import type { OTABundle } from "../../../src/schemas/ota.schema.js";

describe("ota-manager", () => {
  let tmpDir: string;
  let bundleDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-ota-test-"));
    bundleDir = path.join(tmpDir, "ota");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeBundleManifest(version: string): void {
    const dir = path.join(bundleDir, version);
    fs.mkdirSync(dir, { recursive: true });
    const manifest: OTABundle = {
      version,
      elf_path: "build/firmware.elf",
      binary_path: path.join(dir, `firmware-${version}.bin`),
      checksum: "abc123deadbeef",
      built_at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(dir, "bundle.json"), JSON.stringify(manifest));
  }

  it("returns empty array when no bundle directory exists", () => {
    const bundles = listBundles("/nonexistent");
    assert.deepStrictEqual(bundles, []);
  });

  it("lists bundle manifests sorted by version", () => {
    writeBundleManifest("1.0.0");
    writeBundleManifest("1.1.0");
    writeBundleManifest("0.9.0");
    const bundles = listBundles(bundleDir);
    assert.equal(bundles.length, 3);
    assert.equal(bundles[0].version, "0.9.0");
    assert.equal(bundles[1].version, "1.0.0");
    assert.equal(bundles[2].version, "1.1.0");
  });

  it("skips malformed bundle manifests", () => {
    writeBundleManifest("1.0.0");
    const badDir = path.join(bundleDir, "bad");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, "bundle.json"), "not json{{{");
    const bundles = listBundles(bundleDir);
    assert.equal(bundles.length, 1);
    assert.equal(bundles[0].version, "1.0.0");
  });

  it("includes git info in bundle manifest when present", () => {
    const version = "2.0.0";
    const dir = path.join(bundleDir, version);
    fs.mkdirSync(dir, { recursive: true });
    const manifest: OTABundle = {
      version,
      elf_path: "build/firmware.elf",
      binary_path: path.join(dir, "firmware.bin"),
      checksum: "deadbeef",
      built_at: new Date().toISOString(),
      git_commit: "abc1234",
      git_tag: "v2.0.0",
    };
    fs.writeFileSync(path.join(dir, "bundle.json"), JSON.stringify(manifest));
    const bundles = listBundles(bundleDir);
    assert.equal(bundles[0].git_commit, "abc1234");
    assert.equal(bundles[0].git_tag, "v2.0.0");
  });
});
