import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Evidence, EvidenceSignature } from "../schemas/evidence.schema.js";

/** Generate Ed25519 key pair for evidence signing */
export function generateSigningKeyPair(outputDir: string): { privateKeyPath: string; publicKeyPath: string } {
  fs.mkdirSync(outputDir, { recursive: true });

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const privateKeyPath = path.join(outputDir, "evidence.key");
  const publicKeyPath = path.join(outputDir, "evidence.pub");

  fs.writeFileSync(privateKeyPath, privateKey as string, { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, publicKey as string);

  return { privateKeyPath, publicKeyPath };
}

/** Load a private signing key from PEM file */
export function loadSigningKey(keyPath: string): crypto.KeyObject {
  const pem = fs.readFileSync(keyPath, "utf-8");
  return crypto.createPrivateKey(pem);
}

/** Load a public verification key from .pub file or derive from .key file */
export function loadVerifyKey(keyPath: string): crypto.KeyObject {
  const pem = fs.readFileSync(keyPath, "utf-8");
  if (pem.includes("PRIVATE KEY")) {
    const privateKey = crypto.createPrivateKey(pem);
    return crypto.createPublicKey(privateKey);
  }
  return crypto.createPublicKey(pem);
}

/** Sign evidence (before signature field is set) and return signature metadata */
export function signEvidence(evidence: Evidence, privateKey: crypto.KeyObject): EvidenceSignature {
  // Remove any existing signature field before signing
  const { signature: _, ...unsigned } = evidence;
  const payload = JSON.stringify(unsigned);

  const sig = crypto.sign(null, Buffer.from(payload), privateKey);
  const publicKey = crypto.createPublicKey(privateKey);
  const pubKeyDer = publicKey.export({ type: "spki", format: "der" });

  return {
    algorithm: "ed25519",
    public_key: pubKeyDer.toString("hex"),
    signature: sig.toString("hex"),
    signed_at: new Date().toISOString(),
  };
}

/** Verify evidence signature: reconstruct unsigned payload, verify against embedded signature */
export function verifyEvidenceSignature(evidence: Evidence): { valid: boolean; error?: string } {
  if (!evidence.signature) {
    return { valid: false, error: "No signature field in evidence" };
  }

  try {
    const { signature: sigField, ...unsigned } = evidence;
    const payload = JSON.stringify(unsigned);

    const pubKeyDer = Buffer.from(sigField.public_key, "hex");
    const publicKey = crypto.createPublicKey({ key: pubKeyDer, format: "der", type: "spki" });
    const sigBuf = Buffer.from(sigField.signature, "hex");

    const valid = crypto.verify(null, Buffer.from(payload), publicKey, sigBuf);
    return { valid };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Sign arbitrary content (e.g., audit exports) */
export function signAuditExport(content: string, privateKey: crypto.KeyObject): { signature: string; signed_at: string } {
  const sig = crypto.sign(null, Buffer.from(content), privateKey);
  return {
    signature: sig.toString("hex"),
    signed_at: new Date().toISOString(),
  };
}
