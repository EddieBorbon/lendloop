export const HMAC_TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const HMAC_SIGNATURE_HEADER = "X-LendLoop-Signature";
export const MAX_TIMESTAMP_DRIFT_SECONDS = 300; // 5 minutes

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (normA.length !== normB.length || normA.length === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < normA.length; i++) {
    diff |= normA.charCodeAt(i) ^ normB.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Computes HMAC-SHA256(secret, `${timestamp}.${rawBody}`) in lowercase hex
 * using Web Crypto (`crypto.subtle`).
 */
export async function computeHmacSignature(
  secret: string,
  timestamp: string | number,
  rawBody: string
): Promise<string> {
  if (!secret) {
    throw new Error("HMAC secret must not be empty");
  }
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const message = encoder.encode(`${timestamp}.${rawBody}`);
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return bytesToHex(new Uint8Array(signatureBuffer));
}

/**
 * Signs an outbound payload and returns the headers required by LendLoop's HMAC protocol.
 */
export async function createSignedHeaders(
  secret: string,
  rawBody: string,
  nowUnixSeconds: number = Math.floor(Date.now() / 1000)
): Promise<Record<string, string>> {
  const timestamp = String(nowUnixSeconds);
  const signature = await computeHmacSignature(secret, timestamp, rawBody);
  return {
    [HMAC_TIMESTAMP_HEADER]: timestamp,
    [HMAC_SIGNATURE_HEADER]: signature,
  };
}

export interface HmacVerificationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verifies an incoming request's HMAC-SHA256 signature and timestamp freshness
 * (rejects if timestamp drift exceeds 5 minutes).
 */
export async function verifyHmacSignature(params: {
  secret: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  rawBody: string;
  nowUnixSeconds?: number;
}): Promise<HmacVerificationResult> {
  const {
    secret,
    timestampHeader,
    signatureHeader,
    rawBody,
    nowUnixSeconds = Math.floor(Date.now() / 1000),
  } = params;

  if (!secret) {
    return { valid: false, reason: "Server HMAC secret is not configured" };
  }

  if (!timestampHeader || !signatureHeader) {
    return { valid: false, reason: "Missing HMAC timestamp or signature header" };
  }

  const parsedTimestamp = Number(timestampHeader);
  if (!Number.isFinite(parsedTimestamp) || !Number.isInteger(parsedTimestamp)) {
    return { valid: false, reason: "Invalid timestamp format" };
  }

  const drift = Math.abs(nowUnixSeconds - parsedTimestamp);
  if (drift > MAX_TIMESTAMP_DRIFT_SECONDS) {
    return { valid: false, reason: "Timestamp outside allowed 5-minute window" };
  }

  const expectedSignature = await computeHmacSignature(
    secret,
    timestampHeader,
    rawBody
  );

  if (!timingSafeEqualHex(expectedSignature, signatureHeader)) {
    return { valid: false, reason: "Signature mismatch" };
  }

  return { valid: true };
}

