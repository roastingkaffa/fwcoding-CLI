import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  isFeatureEnabled,
  loadCachedLicense,
  saveLicenseCache,
  clearLicenseCache,
  type LicenseStatus,
} from "../../../src/core/license-manager.js";

describe("license-manager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-license-test-"));
    fs.mkdirSync(path.join(tmpDir, ".fwai", "logs"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no cache exists", () => {
    const result = loadCachedLicense(tmpDir);
    assert.equal(result, null);
  });

  it("saves and loads license cache", () => {
    const status: LicenseStatus = {
      valid: true,
      tier: "team",
      features: new Set(["plugins", "audit", "ota"]),
      expiresAt: "2027-01-01",
    };
    saveLicenseCache(status, tmpDir);
    const loaded = loadCachedLicense(tmpDir);
    assert.ok(loaded);
    assert.equal(loaded.valid, true);
    assert.equal(loaded.tier, "team");
    assert.ok(loaded.features.has("plugins"));
    assert.ok(loaded.features.has("audit"));
  });

  it("clears license cache", () => {
    const status: LicenseStatus = { valid: true, tier: "pro", features: new Set() };
    saveLicenseCache(status, tmpDir);
    clearLicenseCache(tmpDir);
    assert.equal(loadCachedLicense(tmpDir), null);
  });

  describe("isFeatureEnabled", () => {
    it("allows all features for enterprise tier", () => {
      const status: LicenseStatus = { valid: true, tier: "enterprise", features: new Set() };
      assert.ok(isFeatureEnabled("plugins", status));
      assert.ok(isFeatureEnabled("audit", status));
      assert.ok(isFeatureEnabled("ota", status));
      assert.ok(isFeatureEnabled("gdb", status));
      assert.ok(isFeatureEnabled("cloud_sync", status));
    });

    it("blocks team features for pro tier", () => {
      const status: LicenseStatus = { valid: true, tier: "pro", features: new Set() };
      assert.ok(isFeatureEnabled("plugins", status));
      assert.ok(isFeatureEnabled("gdb", status));
      assert.ok(!isFeatureEnabled("audit", status));
      assert.ok(!isFeatureEnabled("ota", status));
      assert.ok(!isFeatureEnabled("cloud_sync", status));
    });

    it("blocks gated features for community (null license)", () => {
      assert.ok(!isFeatureEnabled("plugins", null));
      assert.ok(!isFeatureEnabled("audit", null));
      assert.ok(!isFeatureEnabled("gdb", null));
    });

    it("allows features listed explicitly in license", () => {
      const status: LicenseStatus = {
        valid: true,
        tier: "community",
        features: new Set(["gdb"]),
      };
      assert.ok(isFeatureEnabled("gdb", status));
    });
  });
});
