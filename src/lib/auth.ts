// Shared constants for the auth gate. Safe for both Edge and Node runtimes.
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const AUTH_COOKIE_NAME = "agame_auth";
export const SIGNED_MSG = "agame-auth-v1";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getPassword(): string {
  // Cloudflare runtime env (secrets + vars) — works in production
  try {
    const ctx = getCloudflareContext();
    const pwd = ctx?.env?.APP_PASSWORD;
    if (typeof pwd === "string" && pwd.length > 0) return pwd;
  } catch {
    // getCloudflareContext can throw outside a request context
  }
  // Build-time inlined env — works in `next dev` where .env / .dev.vars are loaded
  const pwd = process.env.APP_PASSWORD;
  if (pwd) return pwd;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_PASSWORD env var is required in production");
  }
  return "letmein";
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

export function constantTimeEqualString(a: string, b: string): boolean {
  return constantTimeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
}

export async function signAuthCookie(cookieValue?: string): Promise<string | undefined> {
  if (!cookieValue) return undefined;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getPassword()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SIGNED_MSG));
  return bytesToHex(new Uint8Array(sig));
}

export async function verifyPasswordAndSign(submitted: string): Promise<string | null> {
  if (!constantTimeEqualString(submitted, getPassword())) return null;
  return (await signAuthCookie(submitted)) ?? null;
}

export async function checkAuth(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(getPassword()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = new Uint8Array(
      cookieValue.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []
    );
    return await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(SIGNED_MSG));
  } catch {
    // fall through to constant-time compare fallback
  }
  // Fallback: verify by signing and comparing
  const expected = await signAuthCookie();
  if (!expected) return false;
  return constantTimeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(cookieValue));
}
