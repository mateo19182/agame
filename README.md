# magame

A couch game for two — trivia duels and quick minigames, played on the big screen with two phones as controllers. **Password-gated** so only people you tell the password to can play.

The name is short for "mateo-ainhoa game". One laptop/TV shows the board, two phones join with a 4-letter room code.

## Stack

- **Vite 6 + React 19 + TypeScript + Tailwind 4** — a single-page app
- **React Compiler** (`babel-plugin-react-compiler`) — automatic memoization, enabled in `vite.config.ts`
- **React Router 7** (data router) for client-side routing
- **One Cloudflare Worker** (via `@cloudflare/vite-plugin`) that serves the SPA, the `/api/*` routes, and hosts the realtime **Durable Object** — no separate party server
- **Durable Objects** for realtime (native WebSockets, game state, timers, hibernation)
- **R2** for Memory Lane photos (private, served through an auth-gated route)
- **Open Trivia DB** for general trivia (cached in the Worker's Cache API), plus a hand-written `"Us"` pack
- HMAC-signed cookie auth gate, enforced in the Worker

## Quick start

```bash
pnpm install
cp .dev.vars.example .dev.vars   # APP_PASSWORD=letmein
pnpm dev                         # Vite + Workers runtime on http://localhost:5173
```

Open `http://localhost:5173`:

- You'll be redirected to `/login`. **Default password: `letmein`**
- After login, click **Host a game** (creates a 4-letter code) or **Join a game** (enter the code on a phone)

The two devices see the same game in realtime. The host's screen shows the board, the phones show the controller (buzz button for trivia, etc.). **Sign out** clears the cookie.

## How a match works

A match is a sequence of **minigames**. Each match is `matchLength` rounds long (host chooses in the lobby, default 4). At the end of each round the host moves to the next minigame; the picker only draws from the minigames the host **enabled in the lobby**, and avoids any already played unless `allowRepeats` is on.

| Minigame | What you do | Scoring |
| --- | --- | --- |
| **Trivia** | Buzz in and answer (optionally with wagers) | +1 per correct (rapid), or +wager (wager mode), −wager on wrong |
| **Memory Lane** | Your own photos: guess where & when, then self-score | +1 where, +1 when (self-scored) |
| **Reflex Tap** | Wait for green light, then mash | +1 to whoever taps more |
| **Speed Sort** | Sort fruits and veggies into the right bins | +1 to whoever finishes first |
| **Type Race** | Type the phrase as fast as you can | +1 to whoever finishes first |

Flow per match:

1. **Lobby** — both players join; host picks which minigames to include, how many rounds, and whether repeats are allowed
2. **Minigame intro** — host sees the next minigame's name, taps Begin
3. **Minigame active** — the per-minigame UI plays out
4. **Minigame end** — score deltas shown for one beat, then auto-advance
5. After `matchLength` minigames → **Final**, play again

If the host skips a minigame it's recorded and we move on. If a trivia fetch fails, trivia is disabled for the rest of the match (no retry loop) and the next minigame is picked.

## Auth gate

The SPA shell is public static assets, but everything sensitive — the photos API and the realtime room — is enforced **server-side in the Worker**. `RequireAuth` on the client just routes unauthenticated visitors to `/login` for a clean UX.

The cookie is an HMAC-SHA256 signature of the message `agame-auth-v1` using `APP_PASSWORD` as the key:

- It is **unforgeable** without knowing the password, the password is **never** stored in the cookie, and verification is constant-time.
- The WebSocket upgrade for `/api/room/<code>` is auth-gated too, so realtime control requires a valid cookie.

### Setting the password

| Where | What | Notes |
| --- | --- | --- |
| Production secret | `APP_PASSWORD` | `wrangler secret put APP_PASSWORD` (encrypted in Cloudflare's vault) |
| Local dev | `.dev.vars` → `APP_PASSWORD=...` | Read by the Workers runtime under `vite dev` |

## Settings

`/settings` shows one card per minigame with the knobs that affect how it plays. Photos for Memory Lane are uploaded here (resized client-side, stored in R2). There's also a "Match defaults" section for `matchLength` and `allowRepeats`. Settings live in `localStorage` (`agame:v2:settings`) and are sent with each game.

To customize the "Us" question pack, edit `shared/usQuestions.ts`.

## Project layout

```
index.html             # SPA entry (loads /src/main.tsx, Geist fonts)
vite.config.ts         # Vite: React + React Compiler, Tailwind, Cloudflare plugin
wrangler.jsonc         # Single Worker: assets (SPA) + DO + R2 + run_worker_first /api/*

shared/                # Types & pure helpers shared by client and Worker
  game.ts              # State shape, settings (+enabledMinigames), mergeSettings
  usQuestions.ts       # Hand-written personal pack

worker/                # The Cloudflare Worker
  index.ts             # Router: /api/login,/logout,/me, /api/photos, /api/room/<code>; exports GameRoom
  auth.ts              # HMAC cookie auth (env-based)
  photos.ts            # R2 upload / serve
  room.ts              # GameRoom Durable Object (state machine, timers, scoring, hibernation)
  minigames.ts         # Pure helpers: timing, state factories, winner/next-pick
  trivia.ts            # OpenTDB fetch + Cache API
  env.ts               # Worker bindings (Env)

src/                   # React SPA
  main.tsx             # Router + RequireAuth
  routes/              # Landing, Login, Host, Play, Settings
  components/
    game/              # GameView shell + one file per minigame view + chrome
    RequireAuth.tsx, LogoutButton.tsx
  lib/
    useRoom.ts         # Same-origin WebSocket client hook
    roomSession.ts     # Join/rejoin + per-room sessionStorage (shared by Host/Play)
    settings.ts        # localStorage load/save
    api.ts             # /api/login,/logout,/me client
    photos.ts, useNow.ts, sounds.ts
```

The state machine lives in `worker/room.ts:GameRoom`. Key entry points:
- `pickNextMinigame(state)` (in `minigames.ts`) — next minigame honoring enabled set, `matchLength`, `allowRepeats`, and Memory Lane's photo requirement
- `startActiveMinigame()` — initializes the chosen minigame and schedules its first alarm
- `endMinigame()` — computes score deltas (winner resolved via fixed p1/p2 slots) and transitions to `minigame-end`

## Deploying

Everything is one Worker named `agame`.

```bash
# 1. Set the password secret (one time, then after rotations)
pnpm exec wrangler secret put APP_PASSWORD

# 2. Build the SPA + Worker and deploy
pnpm deploy        # = pnpm build && wrangler deploy
```

The Durable Object (`GameRoom`) and R2 bucket (`agame-photos`) are declared in `wrangler.jsonc`. Static assets are served directly by the runtime; the Worker only runs first for `/api/*` (`run_worker_first`), and unknown routes fall back to the SPA (`not_found_handling: single-page-application`).

For a custom domain, add a Worker Route in the Cloudflare dashboard or via the API pointing `<domain>/*` at the `agame` script.

## Scripts

- `pnpm dev` — Vite dev server on the Workers runtime (SPA + API + DO), port 5173
- `pnpm build` — type-check (app + worker) then `vite build`
- `pnpm preview` — preview the production build locally
- `pnpm lint` — eslint (includes the React Compiler rule)
- `pnpm typecheck` — type-check the app and the worker
- `pnpm deploy` — build + `wrangler deploy`
- `pnpm cf-typegen` — generate Worker binding types
```
