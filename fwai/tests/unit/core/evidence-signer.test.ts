import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  generateSigningKeyPair,
  loadSigningKey,
  signEvidence,
  verifyEvidenceSignature,
} from "../../../src/core/evidence-signer.js";
import type { Evidence } from "../../../src/schemas/evidence.schema.js";

function makeEvidence(): Evidence {
  return {
    run_id: "test-sign-001",
    start_time: "2026-01-01T00:00:00.000Z",
    end_time: "2026-01-01T00:01:00.000Z",
    duration_ms: 60000,
    status: "success",
    tools: [
      { tool: "build", command: "make", exit_code: 0, duration_ms: 5000, log_file: "build.log", status: "success" },
    ],
    project: { name: "test", target_mcu: "STM32F407" },
  };
}

describe("evidence-signer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-signer-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates valid key pair files", () => {
    const { privateKeyPath, publicKeyPath } = generateSigningKeyPair(tmpDir);
    assert.ok(fs.existsSync(privateKeyPath));
    assert.ok(fs.existsSync(publicKeyPath));
    const privPem = fs.readFileSync(privateKeyPath, "utf-8");
    assert.ok(privPem.includes("PRIVATE KEY"));
    const pubPem = fs.readFileSync(publicKeyPath, "utf-8");
    assert.ok(pubPem.includes("PUBLIC KEY"));
  });

  it("sign → verify round-trip succeeds", () => {
    const { privateKeyPath } = generateSigningKeyPair(tmpDir);
    const privateKey = loadSigningKey(privateKeyPath);
    const evidence = makeEvidence();
    const sig = signEvidence(evidence, privateKey);
    assert.equal(sig.algorithm, "ed25519");
    assert.ok(sig.public_key.length > 0);
    assert.ok(sig.signature.length > 0);

    // Attach signature and verify
    evidence.signature = sig;
    const result = verifyEvidenceSignature(evidence);
    assert.ok(result.valid, `Expected valid but got: ${result.error}`);
  });

  it("tampered evidence fails verification", () => {
    const { privateKeyPath } = generateSigningKeyPair(tmpDir);
    const privateKey = loadSigningKey(privateKeyPath);
    const evidence = makeEvidence();
    evidence.signature = signEvidence(evidence, privateKey);

    // Tamper with evidence
    evidence.status = "fail";

    const result = verifyEvidenceSignature(evidence);
    assert.equal(result.valid, false);
  });

  it("missing signature returns invalid", () => {
    const evidence = makeEvidence();
    const result = verifyEvidenceSignature(evidence);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("No signature"));
  });
});
