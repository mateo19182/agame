import type { Env } from "./env";

const MAX_BYTES = 2 * 1024 * 1024; // generous ceiling for an 800px JPEG

// POST /api/photos — body is the raw (already client-resized) image. Stores it
// in R2 and returns its opaque key.
export async function handlePhotoUpload(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return Response.json({ error: "Expected an image body" }, { status: 415 });
  }
  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) return Response.json({ error: "Empty body" }, { status: 400 });
  if (buf.byteLength > MAX_BYTES) return Response.json({ error: "Image too large" }, { status: 413 });

  const key = crypto.randomUUID();
  await env.PHOTOS_BUCKET.put(key, buf, { httpMetadata: { contentType } });
  return Response.json({ key });
}

// GET /api/photos/<key> — streams a stored photo from R2. These personal photos
// stay private (the bucket is never public). Keys are server-minted UUIDs.
export async function handlePhotoGet(key: string, env: Env): Promise<Response> {
  if (!/^[a-f0-9-]{36}$/.test(key)) return new Response("Not found", { status: 404 });

  const object = await env.PHOTOS_BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // Immutable content (keys never change), but private to the authed user.
  headers.set("cache-control", "private, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
