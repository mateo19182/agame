# magame — agent notes

A password-gated couch game for two. Single-page **Vite + React 19** app served by **one Cloudflare Worker** (via `@cloudflare/vite-plugin`) that also exposes `/api/*` and hosts the `GameRoom` **Durable Object** for realtime.

## Stack & conventions

- **Vite 6**, **React 19**, **React Router 7** (data router), **Tailwind 4** (`@tailwindcss/vite`).
- **React Compiler is on** (`babel-plugin-react-compiler` in `vite.config.ts`). Don't hand-add `useMemo`/`useCallback` for perf — the compiler handles memoization. Keep components pure so it can; `pnpm lint` runs the `react-hooks/react-compiler` rule.
- **Three source roots**: `shared/` (types + pure helpers used by both sides), `worker/` (the Cloudflare Worker + DO), `src/` (the React SPA). Aliases: `@/*` → `src/*`, `@shared/*` → `shared/*`.
- `verbatimModuleSyntax` is on — use `import type` for type-only imports.
- Auth, photos, and the realtime room are all enforced **server-side in the Worker**. The client `RequireAuth` is UX only.

## Working here

- Routing only reaches the Worker for `/api/*` (`run_worker_first` in `wrangler.jsonc`); other paths serve static assets, unknown ones fall back to the SPA.
- The realtime WebSocket is same-origin: `/api/room/<code>` → `GameRoom`. No separate party worker, no PartyKit.
- After changes, run `pnpm typecheck && pnpm lint && pnpm build`. `pnpm dev` runs the Workers runtime locally (port 5173); needs `.dev.vars` with `APP_PASSWORD`.
- See `README.md` for the full layout and the game state machine entry points.
