// Password gate for the API + realtime layer. The auth cookie is an HMAC of a
// fixed message keyed by the shared password, so a leaked cookie reveals nothing
// about the password and verification needs only the password (no session store).

export const AUTH_COOKIE_NAME = "agame_auth";
const SIGNED_MSG = "agame-auth-v1";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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

function constantTimeEqualString(a: string, b: string): boolean {
  return constantTimeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
}

async function hmacKey(password: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

/** Sign the auth cookie value for a given password. */
export async function signAuthCookie(password: string): Promise<string> {
  const key = await hmacKey(password, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SIGNED_MSG));
  return bytesToHex(new Uint8Array(sig));
}

/** Constant-time check of a submitted password against the configured one. */
export function passwordMatches(submitted: string, password: string): boolean {
  return constantTimeEqualString(submitted, password);
}

/** Verify an auth cookie value against the configured password. */
export async function checkAuth(cookieValue: string | undefined, password: string): Promise<boolean> {
  if (!cookieValue) return false;
  try {
    const key = await hmacKey(password, "verify");
    const sigBytes = new Uint8Array(cookieValue.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
    return await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(SIGNED_MSG));
  } catch {
    return false;
  }
}

/** Read a cookie value from a request's Cookie header. */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("Cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

export function buildAuthCookie(value: string, secure: boolean): string {
  const attrs = [
    `${AUTH_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearAuthCookie(secure: boolean): string {
  const attrs = [`${AUTH_COOKIE_NAME}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
