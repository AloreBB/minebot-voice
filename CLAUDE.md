# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MineBot: autonomous Minecraft bot (mineflayer) with a React dashboard for voice/text control, powered by an AI command parser (Anthropic Claude or OpenAI-compatible). Responses to the user are in Spanish.

## Commands

Yarn 1.22.19 monorepo driven by Turbo. Run from repo root:

```bash
yarn install
yarn dev       # turbo dev — runs bot (tsx watch) + web (vite) concurrently
yarn build     # turbo build — shared → web (vite) → bot (tsc)
yarn test      # turbo test — currently only the bot package has tests
```

Per-package commands (cd into `apps/bot` or `apps/web`):

```bash
# apps/bot
yarn dev                                       # tsx watch src/server.ts
yarn test                                      # vitest run
yarn test src/__tests__/state-machine.test.ts  # single test file
yarn test -t "pattern"                         # single test by name

# apps/web
yarn dev                                       # vite
yarn generate:textures                         # rebuild item texture atlas
```

Docker (production image = bot serving built web assets from `apps/web/dist`):

```bash
docker compose up -d                      # bot only (connects to external MC server)
docker compose -f docker-compose.server.yml up -d   # optional local Minecraft server
```

Before starting `yarn dev`/`turbo dev`, always check for orphaned watchers (see global CLAUDE.md rule) — `nest.*watch` is not used here, but `tsx watch` + `vite` can stack up the same way.

## Architecture

### Workspaces

- `apps/bot` — Node.js 22 ESM, TypeScript. Express + Socket.io server on port 3001, mineflayer bot, SQLite (better-sqlite3 + Drizzle), Anthropic or OpenAI SDK. Also serves the built web bundle in production.
- `apps/web` — React 19 + Vite. Connects to the bot via Socket.io (JWT in handshake auth).
- `packages/shared` — TS-only source package (`main` points directly at `src/types.ts`). Defines `BotAction`, `BotStats`, Socket.io event maps. Used by both apps.

The bot app is the single deployable unit; web builds into `apps/web/dist` and is served as static files by the Express app (with an SPA fallback).

### Bot control loop (the heart of the project)

Four-layer priority system in `apps/bot/src/bot/`:

1. **`state-machine.ts`** — `evaluateState(ctx)` picks one of four states by strict priority:
   `surviving` (health<6 or hostile<5 blocks) → `executing_command` → `maintaining` (night+outdoors or full inventory) → `idle`.
   A module-level `activeCommand` flag gates the command state; call `setActiveCommand(true/false)` around command execution.
2. **`behaviors.ts`** — Autonomous behaviors keyed by state (wander, flee, fight, sleep, dump junk, collect logs). Guarded by `canStartBehavior()` + a 4s cooldown. `stopCurrentBehavior(bot)` interrupts pathfinder + pvp.
3. **`actions.ts`** — Low-level executors for each `BotAction` variant.
4. **`plugins.ts`** — mineflayer plugins (pathfinder, auto-eat, pvp, collectblock, armor-manager).

`socket/events.ts` runs `tick()` every 2s. When the evaluated state changes to a higher-priority one (`surviving` or `executing_command`) while a behavior is running, it interrupts via `stopCurrentBehavior`. A stats broadcast fires every 1s.

On bot `spawn`, `setupSocketBridge` calls `stopBotListeners()` first to avoid duplicate intervals/listeners on reconnect — this pattern matters because `createBot` auto-reconnects on `end` in `bot/index.ts`.

On spawn the bot chats `/effect give @s minecraft:resistance infinite 255 true` — the bot must be OP on the target server for this to work.

### AI command parser (`apps/bot/src/ai/command-parser.ts`)

Dual-provider: `AI_PROVIDER=anthropic` (default) or `openai`. The OpenAI branch is used with OpenAI-compatible proxies (e.g. MiniMax) and leverages `response_format: json_schema` for guaranteed-valid JSON. The Anthropic branch parses text with a tolerant `extractJSON` helper (strips code fences, falls back to first `{`…last `}`).

Both branches share:
- `SYSTEM_PROMPT` that forces raw-JSON-only output shaped as `{ understood, actions: BotAction[] }`.
- A `memory` tool (read/write/delete) backed by a JSON file at `${MEMORY_DIR}/bot-memories.json`. The agent loop iterates up to 5 tool-use rounds before giving up.
- A conversation-history context formatted from the `conversations` SQLite table (last 10 rows) so the bot remembers recent commands.

When adding new actions: update the `BotAction` union in `packages/shared/src/types.ts`, extend `ACTION_SCHEMA` in the parser, and add an executor in `bot/actions.ts`. The shared type is the contract between Claude's output and the executor.

### Persistence

SQLite via Drizzle (`apps/bot/src/db/`). Tables: `conversations` (command history) and `activity_events` (dashboard feed, paginated via `/api/activity`). DB lives at `DB_PATH` (default `./data/minebot.sqlite`); memories at `MEMORY_DIR` (default `./data/memories`). Both mount to the `minebot-data` volume in Docker.

Follow the global rule: **never write manual SQL migrations** — use Drizzle Kit (`drizzle-kit`) to generate them from `schema.ts`.

### Auth

Simple password + JWT. `/api/login` is rate-limited (10/15min). JWT is verified in both the Express routes (`Authorization: Bearer`) and the Socket.io middleware (`socket.handshake.auth.token`). CORS origins come from `ALLOWED_ORIGINS` (comma-separated, empty = block all cross-origin).

### Web app

`App.tsx` toggles between `LoginPage` and `Dashboard` based on the auth hook. Dashboard subscribes to `bot:stats`, `bot:inventory`, `bot:activity`, `bot:status`, `command:response` and emits `voice:command` for both voice (browser SpeechRecognition in `useVoiceRecognition`) and text input. JWT is persisted in localStorage by `useAuth`.

## Environment variables

Required: `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` + `OPENAI_BASE_URL` when `AI_PROVIDER=openai`), `ACCESS_PASSWORD`, `JWT_SECRET`, `MINECRAFT_HOST`, `MINECRAFT_PORT`, `BOT_USERNAME`. Optional: `AI_PROVIDER`, `AI_MODEL`, `ALLOWED_ORIGINS`, `DB_PATH`, `MEMORY_DIR`, `ANTHROPIC_BASE_URL`.

## Deployment

`docker-compose.yml` is the Dokploy production config: internal-only (`expose: 3001`, no published ports), on the external `dokploy-network`. Do **not** add Traefik compose labels — Dokploy injects them from its domain config (global rule).
