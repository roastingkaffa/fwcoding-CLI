import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadOrgPolicy, mergePolicy, validateRunAgainstPolicy, OrgPolicySchema } from "../../../src/core/org-policy.js";
import type { Policy, Config } from "../../../src/schemas/config.schema.js";
import type { RunSession } from "../../../src/core/evidence.js";

function makePolicy(): Policy {
  return {
    protected_paths: ["src/boot.c"],
    change_budget: { max_files_changed: 5, max_lines_changed: 200 },
    flash_guard: { require_confirmation: true, require_build_success: true },
    require_evidence: true,
    compliance_mode: "none",
    require_signing: false,
    require_sbom: false,
    allowed_tools: [],
    blocked_tools: [],
  };
}

function makeOrgPolicy() {
  return {
    id: "acme-corp-firmware-2026",
    version: "1.0.0",
    overrides: {
      compliance_mode: "iso26262" as const,
      require_signing: true,
    },
    required_signing: true,
    required_sbom: true,
    blocked_tools: ["dangerous-flash"],
    allowed_tools: [],
    blocked_providers: [],
  };
}

describe("org-policy", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-policy-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses valid org policy from JSON file", () => {
    const policyPath = path.join(tmpDir, "org-policy.json");
    fs.writeFileSync(policyPath, JSON.stringify(makeOrgPolicy()));

    const config = { org_policy: { path: policyPath, enforce: true, refresh_interval_sec: 3600 } } as unknown as Config;
    const result = loadOrgPolicy(config, tmpDir);
    assert.ok(result);
    assert.equal(result.id, "acme-corp-firmware-2026");
    assert.equal(result.version, "1.0.0");
  });

  it("merges org policy overrides onto project policy", () => {
    const projectPolicy = makePolicy();
    const orgPolicy = OrgPolicySchema.parse(makeOrgPolicy());

    const merged = mergePolicy(projectPolicy, orgPolicy);
    assert.equal(merged.compliance_mode, "iso26262"); // org override wins
    assert.equal(merged.require_signing, true);
    assert.ok(merged.protected_paths.includes("src/boot.c")); // project still preserved
  });

  it("enforces tool blacklist in validation", () => {
    const orgPolicy = OrgPolicySchema.parse(makeOrgPolicy());
    const merged = mergePolicy(makePolicy(), orgPolicy);

    const session: RunSession = {
      runId: "test-001",
      runDir: tmpDir,
      startTime: new Date(),
      toolResults: [
        { tool: "dangerous-flash", command: "flash", exit_code: 0, duration_ms: 100, log_file: "f.log", status: "success" },
      ],
    };

    const result = validateRunAgainstPolicy(session, merged);
    assert.ok(result.violations.some((v) => v.includes("blocked_tools")));
  });

  it("validates tool whitelist enforcement", () => {
    const orgPolicy = OrgPolicySchema.parse({
      ...makeOrgPolicy(),
      allowed_tools: ["build", "flash"],
      blocked_tools: [],
    });
    const merged = mergePolicy(makePolicy(), orgPolicy);

    const session: RunSession = {
      runId: "test-002",
      runDir: tmpDir,
      startTime: new Date(),
      toolResults: [
        { tool: "unknown-tool", command: "run", exit_code: 0, duration_ms: 100, log_file: "f.log", status: "success" },
      ],
    };

    const result = validateRunAgainstPolicy(session, merged);
    assert.ok(result.violations.some((v) => v.includes("allowed_tools")));
  });
});
