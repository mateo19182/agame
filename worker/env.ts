/// <reference types="@cloudflare/workers-types" />

export interface Env {
  /** Static assets binding (the built SPA). */
  ASSETS: Fetcher;
  /** Durable Object namespace for game rooms. */
  GAME_ROOM: DurableObjectNamespace;
  /** R2 bucket for Memory Lane photos. */
  PHOTOS_BUCKET: R2Bucket;
  /** Shared password gate (set via `wrangler secret put APP_PASSWORD`). */
  APP_PASSWORD: string;
}
