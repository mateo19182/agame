# Buzzer Battle

A trivia + minigame game for two, designed to play on the couch. One laptop/TV shows the board, two phones become the buzzers. **Password-gated** so only people you tell the password to can play.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript, Tailwind 4)
- **Cloudflare Workers + Durable Objects** for realtime (native WebSockets, game state, timers)
- **Open Trivia DB** for general trivia (cached in the Worker's Cache API)
- Hand-written `"Us"` pack for personal questions
- Local storage for settings + photos
- HMAC-signed cookie auth gate (Next.js Edge middleware)

## Quick start

```bash
pnpm install
pnpm dev          # starts Next.js (3000) + party worker (1999) in parallel
```

Open `http://localhost:3000`:

- You'll be redirected to `/login`. **Default password: `letmein`**
- After login, click **Host a game** (creates a 4-letter code) or **Join a game** (enter the code on a phone)

The two devices see the same game in realtime. The host's screen shows the board, the phones show big buzz buttons. **Sign out** link in the corner clears the cookie.

## Auth gate

All routes except `/login` require a valid auth cookie. The cookie is a HMAC-SHA256 signature of the message `agame-auth-v1` using `APP_PASSWORD` as the key. This means:

- The cookie is **unforgeable** without knowing the password
- The password is **never** stored in the cookie
- Verification is constant-time

### Setting the password

| Where | What | Notes |
| --- | --- | --- |
| Production secret | `APP_PASSWORD` | Set with `wrangler secret put APP_PASSWORD` (encrypted in Cloudflare's vault, not visible in source) |
| Local dev (`.dev.vars`) | `APP_PASSWORD=...` | Read by `next dev` |
| Fallback | `"letmein"` | Only used in dev (`NODE_ENV !== "production"`) when no env var is set. Throws in production. |

To set the production password:

```bash
pnpm exec wrangler secret put APP_PASSWORD --config wrangler.jsonc
# then redeploy:
pnpm exec wrangler deploy --config wrangler.jsonc
```

The password is no longer stored in `wrangler.jsonc` as a `vars` entry — it must be a secret.

### WebSocket endpoint

The party server at `agame-party.mateoamadoares.workers.dev` is **not** auth-gated at the network layer. The de-facto protection is that room codes are 4 random letters from a 24-letter alphabet (~330k possibilities), and you can't start a game without two players. Knowing a code requires being in the gate.

If you need stricter WS auth (e.g. per-user tokens), add a token check in the `webSocketMessage` handler in `party/main.ts:559` (reject `host-join` / `player-join` if the cookie/JWT is missing).

## Game flow (~6–8 minutes)

1. **Lobby** — both players join, host taps "Start"
2. **Round 1: Rapid Fire** — 8 trivia questions. First to buzz answers, wrong answer lets the other steal
3. **Round 2: Wagers** — 3 questions. Each player secretly wagers 0–N points, then buzzer applies
4. **Round 3: Memory Lane** *(only if you uploaded photos in /settings)* — both players see each photo, type where & when, then truth reveals and you self-score
5. **Tiebreaker** (if still tied) — random minigame:
   - **Reflex Tap** — wait for green light, mash your button
   - **Speed Sort** — sort fruits/veggies into bins
   - **Type Race** — type the phrase fastest
6. **Final** — winner crowned, play again

## Memory Lane (Round 3)

A personal minigame using your own photos. To set it up:

1. Open `/settings` on the host's laptop
2. In the **Memory Lane** section, drag-and-drop (or tap to upload) photos
3. For each photo, fill in **Where was this?** and **When?** (the truth)
4. Photos are saved in your browser's localStorage
5. When the host starts a game, photos get sent to the room and Round 3 plays after Round 2

During the round: both players see each photo, type their guess, then the truth reveals and each player self-scores their where/when as ✅ or ✗ (1 point per correct).

If no photos are uploaded, Round 3 is skipped entirely.

## Settings

`/` → Settings lets you pick:

- **Pack**: General (OpenTDB) · "Us" (hand-written) · Mixed
- **Difficulty**: easy/medium/hard (general trivia only)
- **Round 1 questions**: 5, 6, 8, 10, 12
- **Round 2 questions**: 1, 2, 3, 5
- **Tiebreaker**: play a minigame if scores tie
- **Memory Lane**: upload + annotate your photos

Settings are saved in `localStorage` and sent with each game.

To customize the "Us" question pack, edit `src/lib/usQuestions.ts`.

## Project layout

```
party/
  main.ts              # Cloudflare Durable Object (state machine, timers, scoring, hibernation)
src/
  app/
    page.tsx           # Landing — Create / Join
    host/[code]/       # Host screen (laptop/TV)
    play/[code]/       # Phone player (buzzer)
    settings/          # Settings page
  components/
    GameView.tsx       # Big phase-routing component
  lib/
    game.ts            # Types, state shape, client messages
    trivia.ts          # OpenTDB fetcher (server side, unused at runtime)
    usQuestions.ts     # Hand-written personal pack
    useRoom.ts         # Native WebSocket client hook
    useNow.ts          # Timer tick hook
    sounds.ts          # WebAudio sound effects
wrangler.party.toml    # DO worker config (Cloudflare-native)
```

## Deploying

This project is deployed to Cloudflare, with the party server as a Cloudflare Worker running Durable Objects and the Next.js web app as another Worker via OpenNext.

### Architecture

| What | Where | URL |
| --- | --- | --- |
| Web (Next.js) | Cloudflare Worker `agame-web` | `https://magame.m19182.dev/` (custom domain) |
| Party server (DOs) | Cloudflare Worker `agame-party` | `wss://agame-party.mateoamadoares.workers.dev/parties/main/<code>` |

The web build inlines `NEXT_PUBLIC_PARTYKIT_HOST=agame-party.mateoamadoares.workers.dev` via `.env.production`, so phones opening `magame.m19182.dev/play/<code>` know where to WebSocket-connect.

### Why direct `wrangler deploy` instead of `partykit deploy`?

`partykit deploy` ships to Cloudflare's shared `partykit.dev` zone, which is capped at 10,000 custom subdomains. We avoid that by deploying the DO worker straight to our own account via `wrangler deploy`. The party server is a single `GameRoom` class extending `DurableObject` (see `party/main.ts:136`) using the native `state.acceptWebSocket()` WebSocket Hibernation API — no PartyKit runtime required.

### One-time setup

1. Cloudflare account with:
   - Zone for the custom domain (e.g. `m19182.dev`)
   - DNS A record `magame` (the web host) — proxied, content `192.0.2.1` is fine; the worker route intercepts
2. CF API token with `Edit Cloudflare Workers` scope (`Account → Profile → API Tokens`)
3. The `Account ID` from the zone overview

Set these as env vars before deploying:

```bash
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_API_TOKEN=...
```

### Deploy the party server

```bash
pnpm run deploy:party
# i.e. wrangler deploy --config wrangler.party.toml
```

This ships the `GameRoom` DO class. `wrangler.party.toml` declares:
- The DO migration (`v1: new_sqlite_classes = ["GameRoom"]`)
- The `PARTYKIT_DURABLE` binding to that class
- The party room URL in `vars.PARTYKIT_HOST`

> **Note:** if you have an older deployment using the `PartyDurable` class (pre-refactor), the `v1` migration here will conflict. Either delete the existing DO namespace from the Cloudflare dashboard first, or restore the old `v2` migration above `v1` to keep history linear.

For a custom domain, also create a Worker Route:

```bash
curl -X POST https://api.cloudflare.com/client/v4/zones/<zone_id>/workers/routes \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -d '{"pattern":"<party-domain>/*","script":"agame-party"}'
```

(We deliberately don't use a custom domain on the party — workers.dev URLs are free, infinite-capacity, and avoid the `partykit.dev` zone limit entirely.)

### Deploy the web

```bash
# 1. Set the APP_PASSWORD secret (one time, then re-run after rotations)
pnpm exec wrangler secret put APP_PASSWORD --config wrangler.jsonc

# 2. Build with the right NEXT_PUBLIC_PARTYKIT_HOST (inlined into the client bundle)
#    This is set via .env.production
pnpm exec opennextjs-cloudflare build

# 3. Deploy the resulting Worker
pnpm exec wrangler deploy --config wrangler.jsonc

# 4. For a custom domain, add a Worker Route
curl -X POST https://api.cloudflare.com/client/v4/zones/<zone_id>/workers/routes \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -d '{"pattern":"<web-domain>/*","script":"agame-web"}'
```

### Local dev (unchanged)

```bash
pnpm dev
```

Uses concurrently to run Next.js (3000) + `wrangler dev` for the party worker (1999) for fast iteration without touching Cloudflare. The party worker uses local DO persistence automatically.

## Scripts

- `pnpm dev` — both servers (concurrently)
- `pnpm dev:next` — Next.js only
- `pnpm dev:party` — `wrangler dev` for the party worker (port 1999)
- `pnpm build` — production build (standard Next.js)
- `pnpm lint` — eslint
- `pnpm start` — production server
- `pnpm deploy` — OpenNext build + wrangler deploy for the web
- `pnpm deploy:party` — wrangler deploy for the party worker
- `pnpm cf-typegen` — generate `worker-configuration.d.ts`
