import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Evidence, EvidenceSignature } from "../schemas/evidence.schema.js";

/** Generate Ed25519 key pair for evidence signing */
export function generateSigningKeyPair(outputDir: string): {
  privateKeyPath: string;
  publicKeyPath: string;
} {
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

/** Short, stable identifier for a public key: SHA-256 over its SPKI DER encoding. */
export function fingerprintPublicKey(publicKey: crypto.KeyObject): string {
  const der = publicKey.export({ type: "spki", format: "der" });
  return crypto.createHash("sha256").update(der).digest("hex").slice(0, 16);
}

/**
 * The set of public keys whose signatures we are willing to believe.
 *
 * Verification without one of these is integrity-only: it proves the evidence
 * has not changed since *someone* signed it, not that the signer is anyone we
 * recognize. An attacker who edits evidence can always re-sign with a key they
 * generated themselves and embed that key in the file.
 */
export interface TrustStore {
  /** fingerprint → human-readable source (file path) */
  keys: Map<string, string>;
}

/** Default directory holding trusted verification keys */
export const DEFAULT_TRUSTED_KEYS_DIR = ".fwai/keys/trusted";

/** Build a trust store from explicit key files and/or a directory of key files */
export function loadTrustStore(opts: {
  keyPaths?: string[];
  dir?: string;
  cwd?: string;
}): TrustStore {
  const keys = new Map<string, string>();
  const cwd = opts.cwd ?? process.cwd();
  const resolve = (p: string) => (path.isAbsolute(p) ? p : path.resolve(cwd, p));

  const candidates: string[] = [...(opts.keyPaths ?? [])];

  if (opts.dir) {
    const dir = resolve(opts.dir);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      for (const entry of fs.readdirSync(dir)) {
        if (/\.(pub|pem)$/.test(entry)) candidates.push(path.join(dir, entry));
      }
    }
  }

  for (const candidate of candidates) {
    const keyPath = resolve(candidate);
    try {
      const publicKey = loadVerifyKey(keyPath);
      keys.set(fingerprintPublicKey(publicKey), keyPath);
    } catch {
      // An unreadable or malformed key file must not take down verification of
      // the keys that did load — it just isn't trusted.
    }
  }

  return { keys };
}

export interface VerificationResult {
  /** Signature checks out AND the signing key is trusted. The only "yes". */
  valid: boolean;
  /** Signature matches the payload under the key embedded in the evidence. */
  integrity: boolean;
  /** The embedded key is present in the supplied trust store. */
  trusted: boolean;
  /** Fingerprint of the embedded signing key, when it could be parsed. */
  keyId?: string;
  error?: string;
}

/**
 * Verify an evidence signature against a trust store.
 *
 * Two independent checks: the signature must match the payload (integrity), and
 * the key that produced it must be one we already trust (authenticity). Both
 * must hold for `valid`. Callers that pass no trust store get integrity only,
 * and `valid` stays false — self-attested evidence is not evidence.
 */
export function verifyEvidenceSignature(
  evidence: Evidence,
  trust?: TrustStore
): VerificationResult {
  const fail = (error: string): VerificationResult => ({
    valid: false,
    integrity: false,
    trusted: false,
    error,
  });

  if (!evidence.signature) {
    return fail("No signature field in evidence");
  }

  let publicKey: crypto.KeyObject;
  let keyId: string;
  try {
    const pubKeyDer = Buffer.from(evidence.signature.public_key, "hex");
    publicKey = crypto.createPublicKey({ key: pubKeyDer, format: "der", type: "spki" });
    keyId = fingerprintPublicKey(publicKey);
  } catch (err) {
    return fail(
      `Malformed public key in signature: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let integrity = false;
  try {
    const { signature: sigField, ...unsigned } = evidence;
    const payload = JSON.stringify(unsigned);
    const sigBuf = Buffer.from(sigField.signature, "hex");
    integrity = crypto.verify(null, Buffer.from(payload), publicKey, sigBuf);
  } catch (err) {
    return {
      valid: false,
      integrity: false,
      trusted: false,
      keyId,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const trusted = trust?.keys.has(keyId) ?? false;

  let error: string | undefined;
  if (!integrity) {
    error = "Signature does not match evidence content";
  } else if (!trust || trust.keys.size === 0) {
    error = `No trusted keys configured — content is intact but signer ${keyId} is unverified. Add the signer's public key under ${DEFAULT_TRUSTED_KEYS_DIR}/ or security.signing.trusted_keys.`;
  } else if (!trusted) {
    error = `Signing key ${keyId} is not in the trust store`;
  }

  return { valid: integrity && trusted, integrity, trusted, keyId, error };
}

/** Sign arbitrary content (e.g., audit exports) */
export function signAuditExport(
  content: string,
  privateKey: crypto.KeyObject
): { signature: string; signed_at: string } {
  const sig = crypto.sign(null, Buffer.from(content), privateKey);
  return {
    signature: sig.toString("hex"),
    signed_at: new Date().toISOString(),
  };
}
