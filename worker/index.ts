import type { Env } from "./env";
import {
  AUTH_COOKIE_NAME,
  buildAuthCookie,
  checkAuth,
  clearAuthCookie,
  passwordMatches,
  readCookie,
  signAuthCookie,
} from "./auth";
import { handlePhotoGet, handlePhotoUpload } from "./photos";

export { GameRoom } from "./room";

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const secure = url.protocol === "https:";

  // ─── Public auth endpoints ─────────────────────────────────────────────
  if (path === "/api/login" && request.method === "POST") {
    const { password } = (await request.json().catch(() => ({}))) as { password?: string };
    if (!password || !passwordMatches(password, env.APP_PASSWORD)) {
      return json({ error: "Wrong password" }, { status: 401 });
    }
    const cookie = await signAuthCookie(env.APP_PASSWORD);
    return json({ ok: true }, { headers: { "Set-Cookie": buildAuthCookie(cookie, secure) } });
  }

  if (path === "/api/logout" && request.method === "POST") {
    return json({ ok: true }, { headers: { "Set-Cookie": clearAuthCookie(secure) } });
  }

  const authed = await checkAuth(readCookie(request, AUTH_COOKIE_NAME), env.APP_PASSWORD);

  if (path === "/api/me") {
    return json({ authed });
  }

  // ─── Everything below requires auth ────────────────────────────────────
  if (!authed) return json({ error: "Unauthorized" }, { status: 401 });

  if (path === "/api/photos" && request.method === "POST") {
    return handlePhotoUpload(request, env);
  }

  const photoMatch = path.match(/^\/api\/photos\/([^/]+)$/);
  if (photoMatch && request.method === "GET") {
    return handlePhotoGet(decodeURIComponent(photoMatch[1]), env);
  }

  const roomMatch = path.match(/^\/api\/room\/([A-Za-z0-9_-]+)$/);
  if (roomMatch) {
    const code = roomMatch[1].toUpperCase();
    const id = env.GAME_ROOM.idFromName(code);
    return env.GAME_ROOM.get(id).fetch(request);
  }

  return json({ error: "Not found" }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }
    // Non-API traffic is normally served straight from static assets (the
    // Worker only runs first for /api/*); this is a safety fallback.
    return env.ASSETS.fetch(request);
  },
};
