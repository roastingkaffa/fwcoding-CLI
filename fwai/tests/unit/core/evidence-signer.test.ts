import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  generateSigningKeyPair,
  loadSigningKey,
  loadVerifyKey,
  signEvidence,
  verifyEvidenceSignature,
  loadTrustStore,
  fingerprintPublicKey,
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

  it("sign → verify round-trip succeeds against a trusted key", () => {
    const { privateKeyPath, publicKeyPath } = generateSigningKeyPair(tmpDir);
    const privateKey = loadSigningKey(privateKeyPath);
    const evidence = makeEvidence();
    const sig = signEvidence(evidence, privateKey);
    assert.equal(sig.algorithm, "ed25519");
    assert.ok(sig.public_key.length > 0);
    assert.ok(sig.signature.length > 0);

    // Attach signature and verify against a store holding the signer's key
    evidence.signature = sig;
    const trust = loadTrustStore({ keyPaths: [publicKeyPath] });
    const result = verifyEvidenceSignature(evidence, trust);
    assert.ok(result.valid, `Expected valid but got: ${result.error}`);
    assert.equal(result.integrity, true);
    assert.equal(result.trusted, true);
    assert.equal(result.keyId, fingerprintPublicKey(loadVerifyKey(publicKeyPath)));
  });

  it("tampered evidence fails verification", () => {
    const { privateKeyPath, publicKeyPath } = generateSigningKeyPair(tmpDir);
    const privateKey = loadSigningKey(privateKeyPath);
    const evidence = makeEvidence();
    evidence.signature = signEvidence(evidence, privateKey);

    // Tamper with evidence
    evidence.status = "fail";

    const result = verifyEvidenceSignature(evidence, loadTrustStore({ keyPaths: [publicKeyPath] }));
    assert.equal(result.valid, false);
    assert.equal(result.integrity, false);
  });

  it("missing signature returns invalid", () => {
    const evidence = makeEvidence();
    const result = verifyEvidenceSignature(evidence);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("No signature"));
  });

  it("re-signing tampered evidence with an attacker key is NOT valid", () => {
    // The core threat: an attacker edits evidence, signs it with a key they
    // generated, and embeds that key. Integrity checks out — trust must not.
    const victimDir = path.join(tmpDir, "victim");
    const attackerDir = path.join(tmpDir, "attacker");
    const { publicKeyPath: victimPub } = generateSigningKeyPair(victimDir);
    const { privateKeyPath: attackerPriv } = generateSigningKeyPair(attackerDir);

    const evidence = makeEvidence();
    evidence.status = "success";
    evidence.tools[0].exit_code = 0;
    // Attacker rewrites history, then re-signs with their own key.
    evidence.signature = signEvidence(evidence, loadSigningKey(attackerPriv));

    const trust = loadTrustStore({ keyPaths: [victimPub] });
    const result = verifyEvidenceSignature(evidence, trust);

    assert.equal(result.integrity, true, "attacker's own signature is self-consistent");
    assert.equal(result.trusted, false, "attacker key must not be trusted");
    assert.equal(result.valid, false, "self-attested evidence must never be valid");
    assert.ok(result.error?.includes("not in the trust store"));
  });

  it("without a trust store, verification is integrity-only and never valid", () => {
    const { privateKeyPath } = generateSigningKeyPair(tmpDir);
    const evidence = makeEvidence();
    evidence.signature = signEvidence(evidence, loadSigningKey(privateKeyPath));

    const result = verifyEvidenceSignature(evidence);
    assert.equal(result.integrity, true);
    assert.equal(result.trusted, false);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("No trusted keys configured"));
  });

  it("loads trusted keys from a directory, skipping malformed files", () => {
    const trustedDir = path.join(tmpDir, "trusted");
    fs.mkdirSync(trustedDir, { recursive: true });

    const { publicKeyPath } = generateSigningKeyPair(path.join(tmpDir, "signer"));
    fs.copyFileSync(publicKeyPath, path.join(trustedDir, "signer.pub"));
    fs.writeFileSync(path.join(trustedDir, "garbage.pub"), "not a key at all");
    fs.writeFileSync(path.join(trustedDir, "notes.txt"), "ignored — wrong extension");

    const trust = loadTrustStore({ dir: trustedDir });
    assert.equal(trust.keys.size, 1);
    assert.ok(trust.keys.has(fingerprintPublicKey(loadVerifyKey(publicKeyPath))));
  });

  it("accepts a private key file as a trust source (derives the public half)", () => {
    const { privateKeyPath, publicKeyPath } = generateSigningKeyPair(tmpDir);
    const trust = loadTrustStore({ keyPaths: [privateKeyPath] });
    assert.ok(trust.keys.has(fingerprintPublicKey(loadVerifyKey(publicKeyPath))));
  });

  it("malformed public key in the signature is reported, not thrown", () => {
    const evidence = makeEvidence();
    evidence.signature = {
      algorithm: "ed25519",
      public_key: "zzzz-not-hex",
      signature: "00",
      signed_at: "2026-01-01T00:00:00.000Z",
    };
    const result = verifyEvidenceSignature(evidence, loadTrustStore({ keyPaths: [] }));
    assert.equal(result.valid, false);
    assert.equal(result.integrity, false);
    assert.ok(result.error?.includes("Malformed public key"));
  });
});
