# magame

A couch game for two — trivia duels and quick minigames, played on the big screen with two phones as controllers. **Password-gated** so only people you tell the password to can play.

The name is short for "mateo-ainhoa game". One laptop/TV shows the board, two phones join with a 4-letter room code.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript, Tailwind 4)
- **Cloudflare Workers + Durable Objects** for realtime (native WebSockets, game state, timers, hibernation)
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

The two devices see the same game in realtime. The host's screen shows the board, the phones show the controller (buzz button for trivia, etc.). **Sign out** link in the corner clears the cookie.

## How a match works

A match is a sequence of **minigames**. Each match is `matchLength` rounds long (host chooses in the lobby, default 4). At the end of each round the host moves to the next minigame; the picker avoids any minigame that's already been played unless `allowRepeats` is on.

The five minigames, all configurable in `/settings`:

| Minigame | What you do | Scoring |
| --- | --- | --- |
| **Trivia** | Buzz in and answer (optionally with wagers) | +1 per correct (rapid), or +wager (wager mode), −wager on wrong |
| **Memory Lane** | Your own photos: guess where & when, then self-score | +1 where, +1 when (self-scored) |
| **Reflex Tap** | Wait for green light, then mash | +1 to whoever taps more |
| **Speed Sort** | Sort fruits and veggies into the right bins | +1 to whoever finishes first |
| **Type Race** | Type the phrase as fast as you can | +1 to whoever finishes first |

Flow per match:

1. **Lobby** — both players join, host picks which minigames to include + how many rounds + whether repeats are allowed
2. **Minigame intro** — host sees the next minigame's name, taps Begin
3. **Minigame active** — the per-minigame UI plays out (buzzing / photo guessing / tapping / sorting / typing)
4. **Minigame end** — score deltas shown for one beat, then auto-advance
5. After `matchLength` minigames → **Final**, play again

If the host skips a minigame or a trivia fetch fails, the round is recorded and we move to the next pick.

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

If you need stricter WS auth (e.g. per-user tokens), add a token check in the `webSocketMessage` handler in `party/main.ts` (reject `host-join` / `player-join` if the cookie/JWT is missing).

## Settings

`/settings` shows one card per minigame with the knobs that affect how it plays. Photos for Memory Lane are uploaded and annotated here. There's also a "Match defaults" section for `matchLength` and `allowRepeats`, which the lobby can override per match.

Settings are saved in `localStorage` (`agame:v2:settings`) and sent with each game.

To customize the "Us" question pack, edit `src/lib/usQuestions.ts`.

### Per-minigame fields

- **Trivia** — pack (general / "Us" / mixed), difficulty (general only), question count (5/6/8/10/12), use wagers
- **Memory Lane** — photo upload + where/when annotations (drag-and-drop or tap to upload)
- **Reflex Tap** — tap window after green, light delay min/max
- **Speed Sort** — item count (2/4/6/8)
- **Type Race** — prompt variety

## Project layout

```
party/
  main.ts              # Cloudflare Durable Object (state machine, timers, scoring, hibernation)
src/
  app/
    page.tsx           # Landing — Create / Join
    host/[code]/       # Host screen (laptop/TV)
    play/[code]/       # Phone player (controller)
    settings/          # Settings page
  components/
    GameView.tsx       # Big phase-routing component
  lib/
    game.ts            # Types, state shape, client messages, defaults
    photos.ts          # Image → JPEG data-URL resizer
    usQuestions.ts     # Hand-written personal pack
    useRoom.ts         # Native WebSocket client hook
    useNow.ts          # Timer tick hook
    sounds.ts          # WebAudio sound effects
    auth.ts            # HMAC auth helpers
wrangler.party.toml    # DO worker config (Cloudflare-native)
```

The state machine lives in `party/main.ts:GameRoom`. Key entry points:
- `pickNextMinigame(state)` — chooses the next minigame honoring `matchLength` + `allowRepeats`
- `startActiveMinigame()` — initializes the chosen minigame's state and schedules its first alarm
- `endMinigame()` — computes score deltas and transitions to `minigame-end`

## Deploying

This project is deployed to Cloudflare, with the party server as a Cloudflare Worker running Durable Objects and the Next.js web app as another Worker via OpenNext.

### Architecture

| What | Where | URL |
| --- | --- | --- |
| Web (Next.js) | Cloudflare Worker `agame-web` | `https://magame.m19182.dev/` (custom domain) |
| Party server (DOs) | Cloudflare Worker `agame-party` | `wss://agame-party.mateoamadoares.workers.dev/parties/main/<code>` |

The web build inlines `NEXT_PUBLIC_PARTYKIT_HOST=agame-party.mateoamadoares.workers.dev` via `.env.production`, so phones opening `magame.m19182.dev/play/<code>` know where to WebSocket-connect.

### Why direct `wrangler deploy` instead of `partykit deploy`?

`partykit deploy` ships to Cloudflare's shared `partykit.dev` zone, which is capped at 10,000 custom subdomains. We avoid that by deploying the DO worker straight to our own account via `wrangler deploy`. The party server is a single `GameRoom` class extending `DurableObject` (see `party/main.ts:GameRoom`) using the native `state.acceptWebSocket()` WebSocket Hibernation API — no PartyKit runtime required.

### One-time setup

1. Cloudflare account with:
   - Zone for the custom domain (e.g. `m19182.dev`)
   - DNS A record `magame` (the web host) — proxied, content `192.0.2.1` is fine; the worker route intercepts
2. CF API token with `Edit Cloudflare Workers` scope (`Account → Profile → API Tokens`)
3. The `Account ID` from the zone overview

Authenticate once with `pnpm exec wrangler login` (uses OAuth, no token needed for subsequent deploys).

### Deploy the party server

```bash
pnpm run deploy:party
# i.e. wrangler deploy --config wrangler.party.toml
```

This ships the `GameRoom` DO class. `wrangler.party.toml` declares:
- The DO migration history (final binding is `GameRoom`)
- The `PARTYKIT_DURABLE` binding to that class
- The party room URL in `vars.PARTYKIT_HOST`

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
- `pnpm deploy:party` — wrangler deploy for the party server
- `pnpm cf-typegen` — generate `worker-configuration.d.ts`
