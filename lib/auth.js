// Session auth using Web Crypto HMAC so it works in both the Edge middleware
// and Node route handlers. Single-admin password comes from env.

const COOKIE = "deployer_session";
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function b64url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(str) {
  const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function getSecret() {
  return process.env.SESSION_SECRET || "insecure-dev-secret-change-me";
}

export async function createSessionToken() {
  const payload = { sub: "admin", exp: Date.now() + TTL_MS };
  const data = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(getSecret());
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

export async function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [data, sig] = token.split(".");
  try {
    const key = await hmacKey(getSecret());
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sig),
      new TextEncoder().encode(data)
    );
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(data)));
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

// Constant-time-ish string comparison.
export function passwordMatches(input) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return false;
  const a = new TextEncoder().encode(input || "");
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const COOKIE_NAME = COOKIE;
export const COOKIE_MAX_AGE = TTL_MS / 1000;
