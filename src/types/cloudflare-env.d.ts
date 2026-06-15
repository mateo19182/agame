// Augment the auto-generated CloudflareEnv type to include secrets.
// `wrangler types` only includes `vars` from wrangler.jsonc — secrets set
// via `wrangler secret put` are not visible to it. This file adds them so
// the auth code can read env.APP_PASSWORD without a TypeScript error.

export {};

declare global {
  interface CloudflareEnv {
    APP_PASSWORD: string;
  }
}
