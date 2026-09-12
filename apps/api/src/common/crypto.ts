import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY || "";
  if (raw.length >= 64) return Buffer.from(raw.slice(0, 64), "hex");
  return scryptSync(raw || "dev-only-insecure", "impro.chat", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

const REDACT = [
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /password/i,
  /secret/i,
  /pairing/i,
  /otp/i,
  /authorization/i,
  /as_token/i,
  /hs_token/i,
];

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 24 && /^[A-Za-z0-9+/=._-]+$/.test(value)) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.some((r) => r.test(k)) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return value;
}
