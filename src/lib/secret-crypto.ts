/**
 * Secret encryption for stored payment credentials (HashKey, PayPal secrets).
 *
 * AES-256-GCM, matching the scheme used by LiveCore so values can be moved
 * between the two apps with the same key.
 *
 * `decryptSecretIfEncrypted` passes plaintext through untouched, which means an
 * existing unencrypted row keeps working and can be upgraded in place — no
 * migration window where a configured merchant suddenly fails to pay out.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function resolveKey(): Buffer {
  const secret = process.env.PAYMENT_ENCRYPTION_KEY ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("PAYMENT_ENCRYPTION_KEY is required to encrypt payment secrets.");
  }
  return createHash("sha256").update(secret).digest();
}

export function isEncryptedSecret(value: string): boolean {
  const [version, iv, tag, payload] = value.split(":");
  return version === VERSION && Boolean(iv && tag && payload);
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", resolveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSecret(value: string | null): string | null {
  if (!value) return null;

  const [version, iv, tag, payload] = value.split(":");
  if (version !== VERSION || !iv || !tag || !payload) {
    throw new Error("Unsupported encrypted secret format.");
  }

  const decipher = createDecipheriv("aes-256-gcm", resolveKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
}

/** Reads a stored value whether it was encrypted or is still plaintext. */
export function decryptSecretIfEncrypted(value: string): string {
  if (!value || !isEncryptedSecret(value)) return value;
  return decryptSecret(value) ?? "";
}

/** Encrypts only when there is something to protect. */
export function encryptSecretForStorage(value: string): string {
  return value ? encryptSecret(value) : "";
}
