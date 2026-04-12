# MineBot Voice Control - Design Spec

## Overview

Web app to control a Minecraft bot via voice commands. The user speaks into a push-to-talk button, the browser transcribes speech to text (Web Speech API), sends the text to Claude API which translates natural language into Mineflayer bot actions. The bot has autonomous survival behavior via a state machine + Mineflayer plugins. A real-time dashboard shows bot stats, inventory, and activity feed.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Bot engine | Mineflayer direct + plugins | Full control, combat/survival plugins, 1.21.1 support. MCP server lacks combat/crafting. |
| AI role | Claude API for voice command translation only | State machine handles survival/autonomy. Cheaper, faster, more reliable than LLM for reactive behavior. |
| Voice transcription | Web Speech API (browser-native) | Free, no server resources, zero latency for transcription. Chrome/Edge only limitation accepted. |
| Voice interaction | Push-to-talk (hold) + Toggle (click) | Both modes on same button for flexibility. |
| Frontend | React + Vite (TypeScript) | Component-based dashboard (stats, inventory grid, activity feed). |
| Backend | Express + Socket.io + Mineflayer (TypeScript) | Single process. Real-time communication via WebSocket. |
| Monorepo | Turborepo with yarn workspaces | Shared types, unified dev/build commands. |
| Auth | Password in .env + JWT | Single user, no database needed. Simple login page. |
| Bot account | ONLINE_MODE=false + whitelist | No premium account needed for bot. Whitelist for security. |
| Deployment | Docker multi-stage build on user's server | Accessible from any device. Responsive web UI. |

## Architecture

```
Browser (any device)
  │
  │ Socket.io (WSS)
  │
  ▼
Express Server (:3001)
  ├── Auth middleware (JWT)
  ├── Socket.io events
  ├── Claude API (command parsing)
  └── Mineflayer Bot
        ├── Plugins: pathfinder, pvp, auto-eat, armor-manager, collectblock
        ├── State machine (survive > command > maintain > idle)
        └── Event handlers (instant reactions)
  │
  │ TCP (minecraft protocol)
  │
  ▼
Minecraft Server (:25565)
  Paper 1.21.1, ONLINE_MODE=false, whitelist
```

## Project Structure

```
minecraft/
├── docker-compose.yml              # Minecraft server (existing)
├── data/                           # Server data (existing)
├── apps/
│   ├── web/                        # Frontend React + Vite
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── VoiceButton.tsx
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── StatsPanel.tsx
│   │   │   │   ├── InventoryGrid.tsx
│   │   │   │   ├── ActivityFeed.tsx
│   │   │   │   └── LoginPage.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useSocket.ts
│   │   │   │   └── useVoiceRecognition.ts
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   └── bot/                        # Backend Express + Mineflayer
│       ├── src/
│       │   ├── server.ts
│       │   ├── auth.ts
│       │   ├── bot/
│       │   │   ├── index.ts
│       │   │   ├── plugins.ts
│       │   │   ├── state-machine.ts
│       │   │   └── actions.ts
│       │   ├── ai/
│       │   │   └── command-parser.ts
│       │   └── socket/
│       │       └── events.ts
│       └── package.json
│
├── packages/
│   └── shared/
│       ├── src/
│       │   └── types.ts
│       └── package.json
│
├── turbo.json
├── package.json
└── Dockerfile
```

## Bot Intelligence - 3 Layer System

### Layer 1: Instant Reactions (event-driven, 0 delay)

Handled by Mineflayer plugins, no custom code needed for most:

- **auto-eat plugin**: Eats when hunger < threshold
- **armor-manager plugin**: Auto-equips best armor
- **pathfinder entitiesToAvoid**: Avoids creepers, skeletons while navigating
- **Custom entityHurt handler**: When bot is attacked, engage combat or flee based on health
- **Custom health handler**: If health critically low, disengage and flee

### Layer 2: State Machine (every 2-3 seconds, local logic)

Priority-based evaluation, highest priority wins:

```
Priority 1 (CRITICAL) - Survive
  ├── Health < 6 → eat / flee
  ├── Hostile mob within 5 blocks → fight or flee
  ├── Falling / in lava / drowning → escape
  └── auto-eat handles hunger automatically

Priority 2 (HIGH) - User Command
  └── Active command from voice input
      → If interrupted by P1, resume after

Priority 3 (MEDIUM) - Maintenance
  ├── Equip best available armor
  ├── Night + outdoors → find shelter / dig hole
  └── Full inventory → store in nearby chest

Priority 4 (LOW) - Idle
  ├── Mine basic resources (wood, stone, iron)
  ├── Explore surroundings (~50 blocks)
  └── Follow player if online
```

### Layer 3: AI Command Parser (Claude API, on-demand only)

Called ONLY when user sends a voice command. Receives:
- The transcribed text
- Current bot state (health, food, position, inventory summary)
- Available actions list

Returns: An array of actions to execute sequentially.

Example:
- Input: "mina diamantes"
- Claude output: `[{ action: "checkInventory", item: "iron_pickaxe" }, { action: "craft", item: "iron_pickaxe", condition: "if_missing" }, { action: "digDown", toY: -59 }, { action: "mine", block: "diamond_ore", count: 10 }]`

The action format is a fixed schema. Claude picks from a predefined action list — it cannot hallucinate arbitrary commands.

## Frontend Dashboard

### Layout (responsive, mobile-first)

**Stats Panel**: Health bar, hunger bar, XP level, position (X/Y/Z), time of day, current state.

**Inventory Grid**: Visual grid mimicking Minecraft inventory. Shows item icon/name and count per slot.

**Activity Feed**: Scrollable log of bot actions with timestamps. Color-coded by type (danger=red, command=blue, idle=gray).

**Voice Button**: Large centered button. Hold = push-to-talk, click = toggle. Visual feedback: idle (gray), listening (red pulse), processing (yellow), response (green).

**Command/Response area**: Shows last transcribed command and bot's response/action taken.

### Socket.io Events

Server → Client:
- `bot:stats` — health, food, xp, position, state (every 1s)
- `bot:inventory` — full inventory (on change)
- `bot:activity` — activity log entry (on event)
- `bot:status` — connected/disconnected/dead (on change)
- `command:response` — Claude's parsed action + human-readable response

Client → Server:
- `voice:command` — transcribed text from Web Speech API

## Authentication

Single-user password auth:
1. `ACCESS_PASSWORD` env var in `.env`
2. Login page: input field + submit
3. Backend: POST `/api/login` validates password, returns JWT (24h expiry)
4. JWT stored in localStorage
5. Socket.io connection sends JWT in auth handshake
6. Socket middleware validates JWT on every connection

No registration, no database, no user management.

## Docker Deployment

Multi-stage Dockerfile:
1. Stage 1: Install dependencies + build frontend (Vite) + compile backend (TypeScript)
2. Stage 2: Production image with compiled JS + static frontend assets
3. Express serves the React build as static files in production

docker-compose.yml additions:
```yaml
services:
  minecraft:
    # ... existing config
    environment:
      ONLINE_MODE: "false"  # Changed for bot access

  minebot:
    build: .
    container_name: minebot
    environment:
      ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"
      ACCESS_PASSWORD: "${ACCESS_PASSWORD}"
      MINECRAFT_HOST: "minecraft"
      MINECRAFT_PORT: "25565"
      BOT_USERNAME: "MineBot"
      JWT_SECRET: "${JWT_SECRET}"
      NODE_ENV: "production"
    ports:
      - "127.0.0.1:3001:3001"  # localhost only per security rules
    depends_on:
      minecraft:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
```

Note: Port bound to 127.0.0.1 per server security rules. Use reverse proxy (Traefik/nginx) for external access with HTTPS.

## Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...
ACCESS_PASSWORD=your-secret-password
JWT_SECRET=random-string-for-jwt-signing
MINECRAFT_HOST=minecraft
MINECRAFT_PORT=25565
BOT_USERNAME=MineBot
```

## Key Dependencies

### Backend (apps/bot)
- express
- socket.io
- mineflayer
- mineflayer-pathfinder
- mineflayer-pvp
- mineflayer-auto-eat
- mineflayer-armor-manager
- mineflayer-collectblock
- @anthropic-ai/sdk
- jsonwebtoken

### Frontend (apps/web)
- react
- react-dom
- socket.io-client

### Shared (packages/shared)
- typescript (types only, no runtime deps)
