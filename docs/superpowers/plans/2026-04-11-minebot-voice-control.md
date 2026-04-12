# MineBot Voice Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a voice-controlled Minecraft bot with real-time dashboard, autonomous survival behavior, and Claude-powered natural language command parsing.

**Architecture:** Turborepo monorepo with React+Vite frontend (dashboard + voice control) and Express+Socket.io backend (Mineflayer bot + Claude API). Bot uses event-driven plugins for instant survival reactions and a priority-based state machine for autonomous behavior. Claude API is used only to translate voice commands into bot actions.

**Tech Stack:** TypeScript, Turborepo, React, Vite, Express, Socket.io, Mineflayer (+ pathfinder, pvp, auto-eat, armor-manager, collectblock plugins), Claude API (@anthropic-ai/sdk), jsonwebtoken, vitest

---

## File Map

```
apps/bot/
  src/
    server.ts              — Express server, static file serving, Socket.io init
    auth.ts                — JWT creation/validation, login endpoint, socket middleware
    bot/
      index.ts             — createBot factory, connection management, reconnection
      plugins.ts           — Load and configure all Mineflayer plugins
      state-machine.ts     — Priority-based autonomous behavior loop
      actions.ts           — Action executor: maps BotAction objects to Mineflayer calls
    ai/
      command-parser.ts    — Claude API: natural language text → BotAction[]
    socket/
      events.ts            — Bridge Mineflayer events to Socket.io emissions
  package.json
  tsconfig.json
  vitest.config.ts

apps/web/
  src/
    App.tsx                — Root component, auth routing
    components/
      LoginPage.tsx        — Password input, login submit
      Dashboard.tsx        — Layout: stats + inventory + feed + voice
      StatsPanel.tsx       — Health, hunger, xp, position, time, state
      InventoryGrid.tsx    — Visual inventory grid
      ActivityFeed.tsx     — Scrollable activity log
      VoiceButton.tsx      — Push-to-talk / toggle button with visual feedback
      CommandDisplay.tsx   — Shows last command + bot response
    hooks/
      useSocket.ts         — Socket.io connection + event subscriptions
      useVoiceRecognition.ts — Web Speech API wrapper
      useAuth.ts           — JWT storage, login, logout
    index.css              — Global styles, dark theme
  index.html
  package.json
  tsconfig.json
  vite.config.ts

packages/shared/
  src/
    types.ts               — All shared TypeScript interfaces and types
  package.json
  tsconfig.json

(root)
  package.json             — Yarn workspaces config
  turbo.json               — Turborepo pipeline config
  .env.example             — Env var template
  .gitignore
  Dockerfile               — Multi-stage production build
  docker-compose.yml       — Updated with minebot service
```

---

## Task 1: Turborepo Monorepo Scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/bot/package.json`
- Create: `apps/bot/tsconfig.json`
- Create: `apps/bot/vitest.config.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`

- [ ] **Step 1: Create root package.json with yarn workspaces**

```json
{
  "name": "minebot",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
.env
*.log
.turbo/
```

- [ ] **Step 4: Create .env.example**

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
ACCESS_PASSWORD=your-secret-password
JWT_SECRET=generate-a-random-string-here
MINECRAFT_HOST=minecraft
MINECRAFT_PORT=25565
BOT_USERNAME=MineBot
```

- [ ] **Step 5: Create packages/shared/package.json and tsconfig.json**

`packages/shared/package.json`:
```json
{
  "name": "@minebot/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/types.ts",
  "types": "./src/types.ts",
  "scripts": {
    "build": "tsc",
    "test": "echo 'no tests'"
  },
  "devDependencies": {
    "typescript": "^5.7"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create apps/bot/package.json and tsconfig.json**

`apps/bot/package.json`:
```json
{
  "name": "@minebot/bot",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39",
    "@minebot/shared": "*",
    "express": "^5",
    "jsonwebtoken": "^9",
    "mineflayer": "^4.37",
    "mineflayer-armor-manager": "^2",
    "mineflayer-auto-eat": "^5",
    "mineflayer-collectblock": "^1.6",
    "mineflayer-pathfinder": "^2.4",
    "mineflayer-pvp": "^1.3",
    "socket.io": "^4"
  },
  "devDependencies": {
    "@types/express": "^5",
    "@types/jsonwebtoken": "^9",
    "tsx": "^4",
    "typescript": "^5.7",
    "vitest": "^3"
  }
}
```

`apps/bot/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/shared" }
  ]
}
```

`apps/bot/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

- [ ] **Step 7: Create apps/web/package.json, tsconfig.json, vite.config.ts, and index.html**

`apps/web/package.json`:
```json
{
  "name": "@minebot/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "echo 'no tests yet'"
  },
  "dependencies": {
    "@minebot/shared": "*",
    "react": "^19",
    "react-dom": "^19",
    "socket.io-client": "^4"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5.7",
    "vite": "^6"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/shared" }
  ]
}
```

`apps/web/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
```

`apps/web/index.html`:
```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MineBot Control</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Install dependencies**

Run: `cd /home/alore/proyectos/minecraft && yarn install`

- [ ] **Step 9: Verify turbo works**

Run: `yarn turbo build --dry-run`
Expected: Shows task graph with `@minebot/shared#build`, `@minebot/bot#build`, `@minebot/web#build`

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Turborepo monorepo with bot, web, and shared packages"
```

---

## Task 2: Shared Types Package

**Files:**
- Create: `packages/shared/src/types.ts`

- [ ] **Step 1: Write all shared types**

`packages/shared/src/types.ts`:
```typescript
// Bot state for the autonomous state machine
export type BotState = 'surviving' | 'executing_command' | 'maintaining' | 'idle'

// Connection status
export type BotStatus = 'connecting' | 'connected' | 'disconnected' | 'dead'

// Stats sent every 1s from server to client
export interface BotStats {
  health: number
  food: number
  xp: { level: number; progress: number }
  position: { x: number; y: number; z: number }
  state: BotState
  timeOfDay: number
  isRaining: boolean
}

// Single inventory item
export interface InventoryItem {
  slot: number
  name: string
  displayName: string
  count: number
}

// Activity feed entry
export interface ActivityEvent {
  id: string
  timestamp: number
  type: 'danger' | 'command' | 'action' | 'info'
  message: string
}

// Voice command from client
export interface VoiceCommand {
  text: string
  timestamp: number
}

// Claude's parsed response
export interface CommandResponse {
  understood: string
  actions: BotAction[]
}

// All possible bot actions (fixed schema, Claude picks from these)
export type BotAction =
  | { action: 'moveTo'; x: number; y: number; z: number }
  | { action: 'mine'; block: string; count: number }
  | { action: 'digDown'; toY: number }
  | { action: 'follow'; player: string }
  | { action: 'attack'; entity: string }
  | { action: 'craft'; item: string }
  | { action: 'equipItem'; item: string; destination: string }
  | { action: 'dropItem'; item: string; count: number }
  | { action: 'stop' }
  | { action: 'say'; message: string }

// Socket.io typed events
export interface ServerToClientEvents {
  'bot:stats': (stats: BotStats) => void
  'bot:inventory': (items: InventoryItem[]) => void
  'bot:activity': (event: ActivityEvent) => void
  'bot:status': (status: BotStatus) => void
  'command:response': (response: CommandResponse) => void
}

export interface ClientToServerEvents {
  'voice:command': (command: VoiceCommand) => void
}

// Auth
export interface LoginRequest {
  password: string
}

export interface LoginResponse {
  token: string
}
```

- [ ] **Step 2: Verify build**

Run: `cd /home/alore/proyectos/minecraft && yarn workspace @minebot/shared build`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add shared TypeScript types for bot state, actions, and socket events"
```

---

## Task 3: Backend Server + Authentication

**Files:**
- Create: `apps/bot/src/auth.ts`
- Create: `apps/bot/src/server.ts`
- Create: `apps/bot/src/__tests__/auth.test.ts`

- [ ] **Step 1: Write failing tests for auth**

`apps/bot/src/__tests__/auth.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createToken, verifyToken } from '../auth.js'

describe('auth', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'test-secret')
    vi.stubEnv('ACCESS_PASSWORD', 'test-password')
  })

  describe('createToken', () => {
    it('returns null for wrong password', () => {
      expect(createToken('wrong')).toBeNull()
    })

    it('returns a JWT string for correct password', () => {
      const token = createToken('test-password')
      expect(token).toBeTypeOf('string')
      expect(token!.split('.')).toHaveLength(3)
    })
  })

  describe('verifyToken', () => {
    it('returns false for invalid token', () => {
      expect(verifyToken('garbage')).toBe(false)
    })

    it('returns true for valid token', () => {
      const token = createToken('test-password')!
      expect(verifyToken(token)).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @minebot/bot test`
Expected: FAIL — cannot find module `../auth.js`

- [ ] **Step 3: Implement auth module**

`apps/bot/src/auth.ts`:
```typescript
import jwt from 'jsonwebtoken'
import { Router } from 'express'
import type { LoginRequest, LoginResponse } from '@minebot/shared'

function getSecret(): string {
  return process.env.JWT_SECRET || 'fallback-dev-secret'
}

export function createToken(password: string): string | null {
  if (password !== process.env.ACCESS_PASSWORD) return null
  return jwt.sign({ auth: true }, getSecret(), { expiresIn: '24h' })
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, getSecret())
    return true
  } catch {
    return false
  }
}

export function authRouter(): Router {
  const router = Router()

  router.post('/api/login', (req, res) => {
    const { password } = req.body as LoginRequest
    const token = createToken(password)
    if (!token) {
      res.status(401).json({ error: 'Invalid password' })
      return
    }
    const response: LoginResponse = { token }
    res.json(response)
  })

  return router
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @minebot/bot test`
Expected: All 4 tests PASS

- [ ] **Step 5: Write server.ts (Express + Socket.io init)**

`apps/bot/src/server.ts`:
```typescript
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ServerToClientEvents, ClientToServerEvents } from '@minebot/shared'
import { authRouter, verifyToken } from './auth.js'

const app = express()
const server = createServer(app)

export const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: '*' },
})

app.use(express.json())
app.use(authRouter())

// Serve frontend static files in production
const __dirname = dirname(fileURLToPath(import.meta.url))
const webDist = join(__dirname, '../../web/dist')
app.use(express.static(webDist))
app.get('*', (_req, res, next) => {
  // Only serve index.html for non-API routes
  if (_req.path.startsWith('/api')) return next()
  res.sendFile(join(webDist, 'index.html'))
})

// Socket.io auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token as string
  if (!token || !verifyToken(token)) {
    return next(new Error('Unauthorized'))
  }
  next()
})

const PORT = Number(process.env.PORT) || 3001

server.listen(PORT, () => {
  console.log(`MineBot server running on port ${PORT}`)
})

export { app, server }
```

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/auth.ts apps/bot/src/server.ts apps/bot/src/__tests__/auth.test.ts
git commit -m "feat: add Express server with JWT auth and Socket.io setup"
```

---

## Task 4: Mineflayer Bot Core + Plugins

**Files:**
- Create: `apps/bot/src/bot/index.ts`
- Create: `apps/bot/src/bot/plugins.ts`

- [ ] **Step 1: Write plugin loader**

`apps/bot/src/bot/plugins.ts`:
```typescript
import type { Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import armorManager from 'mineflayer-armor-manager'
import autoEat from 'mineflayer-auto-eat'
import pvp from 'mineflayer-pvp'
import collectBlock from 'mineflayer-collectblock'

const { pathfinder, Movements } = pathfinderPkg

export function loadPlugins(bot: Bot): void {
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(armorManager)
  bot.loadPlugin(autoEat)
  bot.loadPlugin(pvp)
  bot.loadPlugin(collectBlock)

  bot.once('spawn', () => {
    // Configure pathfinder movements
    const mcData = require('minecraft-data')(bot.version)
    const movements = new Movements(bot)

    movements.canDig = true
    movements.allowParkour = true
    movements.allowSprinting = true
    movements.maxDropDown = 4
    movements.dontCreateFlow = true
    movements.dontMineUnderFallingBlock = true

    // Avoid dangerous entities while pathing
    movements.entitiesToAvoid.add('creeper')
    movements.entitiesToAvoid.add('tnt')

    bot.pathfinder.setMovements(movements)

    // Configure auto-eat
    bot.autoEat.options = {
      priority: 'foodPoints',
      startAt: 14,
      bannedFood: [],
    }

    console.log('[Plugins] All plugins loaded and configured')
  })
}
```

- [ ] **Step 2: Write bot factory with reconnection**

`apps/bot/src/bot/index.ts`:
```typescript
import mineflayer, { type Bot } from 'mineflayer'
import { loadPlugins } from './plugins.js'

export interface BotConfig {
  host: string
  port: number
  username: string
}

let bot: Bot | null = null

export function getBot(): Bot | null {
  return bot
}

export function createBot(config: BotConfig): Bot {
  if (bot) {
    bot.quit()
    bot = null
  }

  console.log(`[Bot] Connecting as ${config.username} to ${config.host}:${config.port}`)

  bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    auth: 'offline',
  })

  loadPlugins(bot)

  bot.on('login', () => {
    console.log('[Bot] Logged in successfully')
  })

  bot.on('spawn', () => {
    console.log('[Bot] Spawned in world')
  })

  bot.on('death', () => {
    console.log('[Bot] Died, will respawn')
  })

  bot.on('kicked', (reason) => {
    console.log(`[Bot] Kicked: ${reason}`)
  })

  bot.on('error', (err) => {
    console.error('[Bot] Error:', err.message)
  })

  bot.on('end', (reason) => {
    console.log(`[Bot] Disconnected: ${reason}`)
    bot = null

    // Auto-reconnect after 5 seconds
    setTimeout(() => {
      console.log('[Bot] Attempting reconnection...')
      createBot(config)
    }, 5000)
  })

  return bot
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/bot/src/bot/index.ts apps/bot/src/bot/plugins.ts
git commit -m "feat: add Mineflayer bot factory with plugins and auto-reconnection"
```

---

## Task 5: Bot State Machine

**Files:**
- Create: `apps/bot/src/bot/state-machine.ts`
- Create: `apps/bot/src/__tests__/state-machine.test.ts`

- [ ] **Step 1: Write failing tests for state evaluation**

`apps/bot/src/__tests__/state-machine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { evaluateState, type EvalContext } from '../bot/state-machine.js'

function makeContext(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    health: 20,
    food: 20,
    nearestHostileDistance: Infinity,
    hasActiveCommand: false,
    isNight: false,
    isOutdoors: true,
    inventoryFull: false,
    ...overrides,
  }
}

describe('evaluateState', () => {
  it('returns surviving when health is critically low', () => {
    expect(evaluateState(makeContext({ health: 4 }))).toBe('surviving')
  })

  it('returns surviving when hostile mob is close', () => {
    expect(evaluateState(makeContext({ nearestHostileDistance: 3 }))).toBe('surviving')
  })

  it('returns executing_command when there is an active command', () => {
    expect(evaluateState(makeContext({ hasActiveCommand: true }))).toBe('executing_command')
  })

  it('returns maintaining when it is night and outdoors', () => {
    expect(evaluateState(makeContext({ isNight: true, isOutdoors: true }))).toBe('maintaining')
  })

  it('returns idle when nothing else applies', () => {
    expect(evaluateState(makeContext())).toBe('idle')
  })

  it('surviving takes priority over active command', () => {
    expect(evaluateState(makeContext({ health: 4, hasActiveCommand: true }))).toBe('surviving')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @minebot/bot test`
Expected: FAIL — cannot find module `../bot/state-machine.js`

- [ ] **Step 3: Implement state machine**

`apps/bot/src/bot/state-machine.ts`:
```typescript
import type { Bot } from 'mineflayer'
import type { BotState } from '@minebot/shared'
import { getBot } from './index.js'

const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
  'witch', 'pillager', 'vindicator', 'drowned', 'phantom',
  'blaze', 'ghast', 'wither_skeleton', 'hoglin', 'piglin_brute',
])

export interface EvalContext {
  health: number
  food: number
  nearestHostileDistance: number
  hasActiveCommand: boolean
  isNight: boolean
  isOutdoors: boolean
  inventoryFull: boolean
}

export function evaluateState(ctx: EvalContext): BotState {
  // Priority 1: Survive
  if (ctx.health < 6 || ctx.nearestHostileDistance < 5) {
    return 'surviving'
  }

  // Priority 2: User command
  if (ctx.hasActiveCommand) {
    return 'executing_command'
  }

  // Priority 3: Maintenance
  if ((ctx.isNight && ctx.isOutdoors) || ctx.inventoryFull) {
    return 'maintaining'
  }

  // Priority 4: Idle
  return 'idle'
}

export function buildContext(bot: Bot, hasActiveCommand: boolean): EvalContext {
  let nearestHostileDistance = Infinity
  for (const entity of Object.values(bot.entities)) {
    if (entity === bot.entity) continue
    if (entity.name && HOSTILE_MOBS.has(entity.name)) {
      const dist = bot.entity.position.distanceTo(entity.position)
      if (dist < nearestHostileDistance) {
        nearestHostileDistance = dist
      }
    }
  }

  const timeOfDay = bot.time.timeOfDay
  const isNight = timeOfDay >= 13000 && timeOfDay <= 23000

  // Rough heuristic: if bot can see sky above
  const blockAbove = bot.blockAt(bot.entity.position.offset(0, 2, 0))
  const isOutdoors = !blockAbove || blockAbove.name === 'air'

  const inventoryFull = bot.inventory.items().length >= 36

  return {
    health: bot.health,
    food: bot.food,
    nearestHostileDistance,
    hasActiveCommand,
    isNight,
    isOutdoors,
    inventoryFull,
  }
}

// Active command tracking
let activeCommand = false

export function setActiveCommand(active: boolean): void {
  activeCommand = active
}

export function hasActiveCommand(): boolean {
  return activeCommand
}

// The main loop — called externally by the event bridge
export function tick(onStateChange: (state: BotState) => void): void {
  const bot = getBot()
  if (!bot?.entity) return

  const ctx = buildContext(bot, activeCommand)
  const state = evaluateState(ctx)
  onStateChange(state)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @minebot/bot test`
Expected: All 6 state machine tests PASS + 4 auth tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/bot/state-machine.ts apps/bot/src/__tests__/state-machine.test.ts
git commit -m "feat: add priority-based bot state machine with tests"
```

---

## Task 6: Bot Actions + Claude Command Parser

**Files:**
- Create: `apps/bot/src/bot/actions.ts`
- Create: `apps/bot/src/ai/command-parser.ts`
- Create: `apps/bot/src/__tests__/command-parser.test.ts`

- [ ] **Step 1: Write action executor**

`apps/bot/src/bot/actions.ts`:
```typescript
import type { Bot } from 'mineflayer'
import type { BotAction } from '@minebot/shared'
import pathfinderPkg from 'mineflayer-pathfinder'

const { goals } = pathfinderPkg
const { GoalNear, GoalBlock, GoalFollow, GoalY, GoalCompositeAny } = goals

export type ActivityLogger = (type: 'danger' | 'command' | 'action' | 'info', message: string) => void

export async function executeAction(bot: Bot, action: BotAction, log: ActivityLogger): Promise<void> {
  switch (action.action) {
    case 'moveTo': {
      log('action', `Moviéndose a X:${action.x} Y:${action.y} Z:${action.z}`)
      bot.pathfinder.setGoal(new GoalNear(action.x, action.y, action.z, 2))
      break
    }

    case 'mine': {
      const blockId = bot.registry.blocksByName[action.block]?.id
      if (!blockId) {
        log('info', `Bloque desconocido: ${action.block}`)
        break
      }
      log('action', `Buscando ${action.block}...`)
      const blocks = bot.findBlocks({
        matching: blockId,
        maxDistance: 64,
        count: action.count,
      })
      if (blocks.length === 0) {
        log('info', `No se encontró ${action.block} cerca`)
        break
      }
      for (const pos of blocks) {
        const block = bot.blockAt(pos)
        if (!block) continue
        log('action', `Minando ${action.block} en ${pos}`)
        try {
          await bot.collectBlock.collect(block)
        } catch {
          log('info', `No pude minar bloque en ${pos}`)
        }
      }
      break
    }

    case 'digDown': {
      log('action', `Cavando hacia Y:${action.toY}`)
      bot.pathfinder.setGoal(new GoalY(action.toY))
      break
    }

    case 'follow': {
      const player = bot.players[action.player]
      if (!player?.entity) {
        log('info', `No veo al jugador ${action.player}`)
        break
      }
      log('action', `Siguiendo a ${action.player}`)
      bot.pathfinder.setGoal(new GoalFollow(player.entity, 3), true)
      break
    }

    case 'attack': {
      const target = bot.nearestEntity(e => e.name === action.entity)
      if (!target) {
        log('info', `No encuentro ${action.entity} cerca`)
        break
      }
      log('action', `Atacando ${action.entity}`)
      bot.pvp.attack(target)
      break
    }

    case 'craft': {
      const itemId = bot.registry.itemsByName[action.item]?.id
      if (!itemId) {
        log('info', `Item desconocido: ${action.item}`)
        break
      }
      const recipes = bot.recipesFor(itemId)
      if (recipes.length === 0) {
        log('info', `No tengo receta para ${action.item}`)
        break
      }
      log('action', `Crafteando ${action.item}`)
      try {
        await bot.craft(recipes[0], 1)
        log('info', `Crafteé ${action.item}`)
      } catch {
        log('info', `No pude craftear ${action.item} — necesito mesa de crafteo?`)
      }
      break
    }

    case 'equipItem': {
      const item = bot.inventory.items().find(i => i.name === action.item)
      if (!item) {
        log('info', `No tengo ${action.item} en inventario`)
        break
      }
      log('action', `Equipando ${action.item}`)
      await bot.equip(item, action.destination as any)
      break
    }

    case 'dropItem': {
      const item = bot.inventory.items().find(i => i.name === action.item)
      if (!item) break
      log('action', `Tirando ${action.count}x ${action.item}`)
      await bot.toss(item.type, null, action.count)
      break
    }

    case 'stop': {
      log('action', 'Deteniendo todas las acciones')
      bot.pathfinder.stop()
      bot.pvp.stop()
      break
    }

    case 'say': {
      log('action', `Diciendo: ${action.message}`)
      bot.chat(action.message)
      break
    }
  }
}

export async function executeActions(bot: Bot, actions: BotAction[], log: ActivityLogger): Promise<void> {
  for (const action of actions) {
    await executeAction(bot, action, log)
  }
}
```

- [ ] **Step 2: Write failing test for command parser**

`apps/bot/src/__tests__/command-parser.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPrompt, parseResponse } from '../ai/command-parser.js'

describe('command-parser', () => {
  describe('buildPrompt', () => {
    it('includes the user command text', () => {
      const prompt = buildPrompt('mina diamantes', {
        health: 20,
        food: 18,
        position: { x: 100, y: 64, z: -50 },
        inventory: ['iron_pickaxe x1', 'cobblestone x32'],
      })
      expect(prompt).toContain('mina diamantes')
      expect(prompt).toContain('health: 20')
    })
  })

  describe('parseResponse', () => {
    it('parses valid JSON action array from Claude response', () => {
      const raw = JSON.stringify({
        understood: 'Buscando diamantes',
        actions: [
          { action: 'digDown', toY: -59 },
          { action: 'mine', block: 'diamond_ore', count: 5 },
        ],
      })
      const result = parseResponse(raw)
      expect(result.understood).toBe('Buscando diamantes')
      expect(result.actions).toHaveLength(2)
      expect(result.actions[0].action).toBe('digDown')
    })

    it('returns error response for invalid JSON', () => {
      const result = parseResponse('not json at all')
      expect(result.understood).toContain('No entendí')
      expect(result.actions).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn workspace @minebot/bot test`
Expected: FAIL — cannot find module `../ai/command-parser.js`

- [ ] **Step 4: Implement command parser**

`apps/bot/src/ai/command-parser.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { CommandResponse, BotAction } from '@minebot/shared'

const anthropic = new Anthropic()

interface BotContext {
  health: number
  food: number
  position: { x: number; y: number; z: number }
  inventory: string[]
}

const ACTION_SCHEMA = `Available actions (JSON array):
- { "action": "moveTo", "x": number, "y": number, "z": number }
- { "action": "mine", "block": "block_name", "count": number }
- { "action": "digDown", "toY": number }
- { "action": "follow", "player": "name" }
- { "action": "attack", "entity": "entity_name" }
- { "action": "craft", "item": "item_name" }
- { "action": "equipItem", "item": "item_name", "destination": "hand|head|torso|legs|feet" }
- { "action": "dropItem", "item": "item_name", "count": number }
- { "action": "stop" }
- { "action": "say", "message": "text" }`

export function buildPrompt(command: string, ctx: BotContext): string {
  return `You are a Minecraft bot assistant. The user gives voice commands in Spanish. Translate the command into a JSON object with "understood" (short Spanish description of what you'll do) and "actions" (array of bot actions).

Bot state:
- health: ${ctx.health}/20
- food: ${ctx.food}/20
- position: X:${ctx.position.x} Y:${ctx.position.y} Z:${ctx.position.z}
- inventory: ${ctx.inventory.join(', ') || 'empty'}

${ACTION_SCHEMA}

Respond ONLY with valid JSON. No markdown, no explanation.

User command: "${command}"`
}

export function parseResponse(raw: string): CommandResponse {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      understood: parsed.understood || 'Ejecutando...',
      actions: (parsed.actions || []) as BotAction[],
    }
  } catch {
    return {
      understood: 'No entendí el comando. Intenta de nuevo.',
      actions: [],
    }
  }
}

export async function parseCommand(command: string, ctx: BotContext): Promise<CommandResponse> {
  const prompt = buildPrompt(command, ctx)

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return parseResponse(text)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn workspace @minebot/bot test`
Expected: All tests PASS (auth 4 + state machine 6 + command parser 3)

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/bot/actions.ts apps/bot/src/ai/command-parser.ts apps/bot/src/__tests__/command-parser.test.ts
git commit -m "feat: add bot action executor and Claude command parser with tests"
```

---

## Task 7: Socket.io Event Bridge

**Files:**
- Create: `apps/bot/src/socket/events.ts`
- Modify: `apps/bot/src/server.ts` (add bot startup + socket wiring)

- [ ] **Step 1: Write the socket event bridge**

`apps/bot/src/socket/events.ts`:
```typescript
import type { Server } from 'socket.io'
import type { Bot } from 'mineflayer'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  BotStats,
  InventoryItem,
  ActivityEvent,
  BotState,
} from '@minebot/shared'
import { tick, setActiveCommand } from '../bot/state-machine.js'
import { parseCommand } from '../ai/command-parser.js'
import { executeActions, type ActivityLogger } from '../bot/actions.js'
import { getBot } from '../bot/index.js'

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>

let eventCounter = 0

function makeActivityEvent(type: ActivityEvent['type'], message: string): ActivityEvent {
  return {
    id: String(++eventCounter),
    timestamp: Date.now(),
    type,
    message,
  }
}

export function setupSocketBridge(io: TypedServer): void {
  let currentState: BotState = 'idle'
  let statsInterval: ReturnType<typeof setInterval> | null = null
  let stateInterval: ReturnType<typeof setInterval> | null = null

  const log: ActivityLogger = (type, message) => {
    io.emit('bot:activity', makeActivityEvent(type, message))
  }

  function startBotListeners(bot: Bot): void {
    // Send stats every 1s
    statsInterval = setInterval(() => {
      if (!bot.entity) return
      const stats: BotStats = {
        health: bot.health,
        food: bot.food,
        xp: { level: bot.experience.level, progress: bot.experience.progress },
        position: {
          x: Math.round(bot.entity.position.x),
          y: Math.round(bot.entity.position.y),
          z: Math.round(bot.entity.position.z),
        },
        state: currentState,
        timeOfDay: bot.time.timeOfDay,
        isRaining: bot.isRaining,
      }
      io.emit('bot:stats', stats)
    }, 1000)

    // State machine tick every 2s
    stateInterval = setInterval(() => {
      tick((state) => {
        if (state !== currentState) {
          currentState = state
          log('info', `Estado: ${state}`)
        }
      })
    }, 2000)

    // Inventory changes
    bot.inventory.on('updateSlot' as any, () => {
      const items: InventoryItem[] = bot.inventory.items().map(item => ({
        slot: item.slot,
        name: item.name,
        displayName: item.displayName,
        count: item.count,
      }))
      io.emit('bot:inventory', items)
    })

    // Bot events → activity feed
    bot.on('death', () => {
      io.emit('bot:status', 'dead')
      log('danger', 'Bot murió!')
    })

    bot.on('spawn', () => {
      io.emit('bot:status', 'connected')
      log('info', 'Bot spawneó en el mundo')
    })

    bot.on('health', () => {
      if (bot.health < 6) {
        log('danger', `Vida baja: ${bot.health}/20`)
      }
    })

    bot.on('entityHurt', (entity) => {
      if (entity === bot.entity) {
        log('danger', `Bot fue golpeado! Vida: ${bot.health}/20`)
      }
    })
  }

  function stopBotListeners(): void {
    if (statsInterval) clearInterval(statsInterval)
    if (stateInterval) clearInterval(stateInterval)
    statsInterval = null
    stateInterval = null
  }

  // Handle voice commands from clients
  io.on('connection', (socket) => {
    console.log('[Socket] Client connected')

    // Send current bot status
    const bot = getBot()
    socket.emit('bot:status', bot?.entity ? 'connected' : 'disconnected')

    socket.on('voice:command', async (command) => {
      const bot = getBot()
      if (!bot?.entity) {
        socket.emit('command:response', {
          understood: 'Bot no está conectado',
          actions: [],
        })
        return
      }

      log('command', `Comando: "${command.text}"`)
      setActiveCommand(true)

      try {
        const ctx = {
          health: bot.health,
          food: bot.food,
          position: {
            x: Math.round(bot.entity.position.x),
            y: Math.round(bot.entity.position.y),
            z: Math.round(bot.entity.position.z),
          },
          inventory: bot.inventory.items().map(i => `${i.name} x${i.count}`),
        }

        const response = await parseCommand(command.text, ctx)
        io.emit('command:response', response)
        log('info', `Entendido: ${response.understood}`)

        await executeActions(bot, response.actions, log)
      } catch (err: any) {
        log('danger', `Error ejecutando comando: ${err.message}`)
      } finally {
        setActiveCommand(false)
      }
    })

    socket.on('disconnect', () => {
      console.log('[Socket] Client disconnected')
    })
  })

  return { startBotListeners, stopBotListeners } as any
}
```

- [ ] **Step 2: Update server.ts to wire everything together**

Replace `apps/bot/src/server.ts` with:
```typescript
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ServerToClientEvents, ClientToServerEvents } from '@minebot/shared'
import { authRouter, verifyToken } from './auth.js'
import { createBot } from './bot/index.js'
import { setupSocketBridge } from './socket/events.js'

const app = express()
const server = createServer(app)

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: '*' },
})

app.use(express.json())
app.use(authRouter())

// Serve frontend static files in production
const __dirname = dirname(fileURLToPath(import.meta.url))
const webDist = join(__dirname, '../../web/dist')
app.use(express.static(webDist))
app.get('*', (_req, res, next) => {
  if (_req.path.startsWith('/api')) return next()
  res.sendFile(join(webDist, 'index.html'))
})

// Socket.io auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token as string
  if (!token || !verifyToken(token)) {
    return next(new Error('Unauthorized'))
  }
  next()
})

// Setup socket event bridge
const bridge = setupSocketBridge(io) as any

// Start bot
const bot = createBot({
  host: process.env.MINECRAFT_HOST || 'localhost',
  port: Number(process.env.MINECRAFT_PORT) || 25565,
  username: process.env.BOT_USERNAME || 'MineBot',
})

bot.once('spawn', () => {
  bridge.startBotListeners(bot)
})

const PORT = Number(process.env.PORT) || 3001

server.listen(PORT, () => {
  console.log(`MineBot server running on port ${PORT}`)
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/bot/src/socket/events.ts apps/bot/src/server.ts
git commit -m "feat: add Socket.io event bridge connecting Mineflayer to frontend"
```

---

## Task 8: Frontend - App Shell + Auth

**Files:**
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/hooks/useAuth.ts`
- Create: `apps/web/src/components/LoginPage.tsx`

- [ ] **Step 1: Write main entry point and global styles**

`apps/web/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

`apps/web/src/index.css`:
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-card: #0f3460;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --accent: #00d4ff;
  --danger: #ff4757;
  --success: #2ed573;
  --warning: #ffa502;
  --command: #70a1ff;
}

body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100dvh;
}

#root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: Write useAuth hook**

`apps/web/src/hooks/useAuth.ts`:
```tsx
import { useState, useCallback } from 'react'

const TOKEN_KEY = 'minebot_token'

export function useAuth() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY)
  )

  const login = useCallback(async (password: string): Promise<boolean> => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) return false
    const { token } = await res.json()
    localStorage.setItem(TOKEN_KEY, token)
    setToken(token)
    return true
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }, [])

  return { token, isAuthenticated: !!token, login, logout }
}
```

- [ ] **Step 3: Write LoginPage component**

`apps/web/src/components/LoginPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react'

interface Props {
  onLogin: (password: string) => Promise<boolean>
}

export function LoginPage({ onLogin }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(false)
    const success = await onLogin(password)
    if (!success) setError(true)
    setLoading(false)
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100dvh',
      padding: '1rem',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--bg-secondary)',
        padding: '2rem',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '360px',
      }}>
        <h1 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>MineBot Control</h1>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '8px',
            border: error ? '2px solid var(--danger)' : '2px solid transparent',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '1rem',
            marginBottom: '1rem',
          }}
        />
        {error && (
          <p style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center' }}>
            Password incorrecto
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent)',
            color: '#000',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Write App.tsx with auth routing**

`apps/web/src/App.tsx`:
```tsx
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './components/LoginPage'
import { Dashboard } from './components/Dashboard'

export default function App() {
  const { token, isAuthenticated, login, logout } = useAuth()

  if (!isAuthenticated || !token) {
    return <LoginPage onLogin={login} />
  }

  return <Dashboard token={token} onLogout={logout} />
}
```

- [ ] **Step 5: Create placeholder Dashboard component**

`apps/web/src/components/Dashboard.tsx`:
```tsx
interface Props {
  token: string
  onLogout: () => void
}

export function Dashboard({ token, onLogout }: Props) {
  return (
    <div style={{ padding: '1rem' }}>
      <h1>MineBot Dashboard</h1>
      <p>Connected with token. Dashboard components coming next.</p>
      <button onClick={onLogout}>Salir</button>
    </div>
  )
}
```

- [ ] **Step 6: Verify frontend builds**

Run: `yarn workspace @minebot/web build`
Expected: Build succeeds, output in `apps/web/dist/`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/
git commit -m "feat: add frontend app shell with auth login and routing"
```

---

## Task 9: Voice Recognition Hook

**Files:**
- Create: `apps/web/src/hooks/useVoiceRecognition.ts`

- [ ] **Step 1: Write Web Speech API hook**

`apps/web/src/hooks/useVoiceRecognition.ts`:
```tsx
import { useState, useCallback, useRef } from 'react'

export type VoiceState = 'idle' | 'listening' | 'processing'

interface SpeechRecognitionEvent {
  results: { [key: number]: { [key: number]: { transcript: string } }; length: number }
}

export function useVoiceRecognition(onResult: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<any>(null)
  const isToggleMode = useRef(false)

  const getRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return null

    const recognition = new SpeechRecognition()
    recognition.lang = 'es-ES'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0][0].transcript
      setTranscript(text)
      setState('processing')
      onResult(text)
    }

    recognition.onerror = () => {
      setState('idle')
    }

    recognition.onend = () => {
      if (!isToggleMode.current) {
        setState(prev => prev === 'processing' ? prev : 'idle')
      }
    }

    recognitionRef.current = recognition
    return recognition
  }, [onResult])

  // Push-to-talk: call on pointerdown
  const startListening = useCallback(() => {
    const recognition = getRecognition()
    if (!recognition) return
    isToggleMode.current = false
    setState('listening')
    recognition.start()
  }, [getRecognition])

  // Push-to-talk: call on pointerup
  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    recognition.stop()
  }, [])

  // Toggle mode: click to start/stop
  const toggleListening = useCallback(() => {
    const recognition = getRecognition()
    if (!recognition) return

    if (state === 'listening') {
      isToggleMode.current = false
      recognition.stop()
    } else {
      isToggleMode.current = true
      setState('listening')
      recognition.start()
    }
  }, [state, getRecognition])

  const isSupported = typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  return {
    state,
    transcript,
    startListening,
    stopListening,
    toggleListening,
    isSupported,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/useVoiceRecognition.ts
git commit -m "feat: add Web Speech API voice recognition hook with push-to-talk and toggle"
```

---

## Task 10: Socket.io Client Hook

**Files:**
- Create: `apps/web/src/hooks/useSocket.ts`

- [ ] **Step 1: Write useSocket hook**

`apps/web/src/hooks/useSocket.ts`:
```tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  BotStats,
  InventoryItem,
  ActivityEvent,
  BotStatus,
  CommandResponse,
  VoiceCommand,
} from '@minebot/shared'

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const MAX_ACTIVITY_ITEMS = 100

export function useSocket(token: string) {
  const socketRef = useRef<TypedSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [botStatus, setBotStatus] = useState<BotStatus>('disconnected')
  const [stats, setStats] = useState<BotStats | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [lastResponse, setLastResponse] = useState<CommandResponse | null>(null)

  useEffect(() => {
    const socket: TypedSocket = io({
      auth: { token },
    })

    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('bot:stats', setStats)
    socket.on('bot:status', setBotStatus)
    socket.on('bot:inventory', setInventory)
    socket.on('bot:activity', (event) => {
      setActivity(prev => [event, ...prev].slice(0, MAX_ACTIVITY_ITEMS))
    })
    socket.on('command:response', setLastResponse)

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [token])

  const sendCommand = useCallback((text: string) => {
    const command: VoiceCommand = { text, timestamp: Date.now() }
    socketRef.current?.emit('voice:command', command)
  }, [])

  return {
    connected,
    botStatus,
    stats,
    inventory,
    activity,
    lastResponse,
    sendCommand,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/useSocket.ts
git commit -m "feat: add typed Socket.io client hook for real-time bot communication"
```

---

## Task 11: Dashboard Components

**Files:**
- Create: `apps/web/src/components/StatsPanel.tsx`
- Create: `apps/web/src/components/InventoryGrid.tsx`
- Create: `apps/web/src/components/ActivityFeed.tsx`
- Create: `apps/web/src/components/VoiceButton.tsx`
- Create: `apps/web/src/components/CommandDisplay.tsx`
- Modify: `apps/web/src/components/Dashboard.tsx`

- [ ] **Step 1: Write StatsPanel**

`apps/web/src/components/StatsPanel.tsx`:
```tsx
import type { BotStats, BotStatus } from '@minebot/shared'

interface Props {
  stats: BotStats | null
  botStatus: BotStatus
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderRadius: '4px',
      height: '20px',
      flex: 1,
      overflow: 'hidden',
    }}>
      <div style={{
        background: color,
        height: '100%',
        width: `${pct}%`,
        transition: 'width 0.3s',
      }} />
    </div>
  )
}

function timeLabel(timeOfDay: number): string {
  if (timeOfDay >= 0 && timeOfDay < 6000) return 'Manana'
  if (timeOfDay >= 6000 && timeOfDay < 12000) return 'Tarde'
  if (timeOfDay >= 12000 && timeOfDay < 13000) return 'Atardecer'
  return 'Noche'
}

export function StatsPanel({ stats, botStatus }: Props) {
  if (!stats) {
    return (
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Stats</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Bot: {botStatus}
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>Stats</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '24px' }}>HP</span>
          <Bar value={stats.health} max={20} color="var(--danger)" />
          <span style={{ width: '50px', textAlign: 'right' }}>{stats.health}/20</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '24px' }}>FD</span>
          <Bar value={stats.food} max={20} color="var(--warning)" />
          <span style={{ width: '50px', textAlign: 'right' }}>{stats.food}/20</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
          <span>XP: Lvl {stats.xp.level}</span>
          <span>X:{stats.position.x} Y:{stats.position.y} Z:{stats.position.z}</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)' }}>
          <span>{timeLabel(stats.timeOfDay)}</span>
          {stats.isRaining && <span>Lluvia</span>}
          <span>Estado: {stats.state}</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write InventoryGrid**

`apps/web/src/components/InventoryGrid.tsx`:
```tsx
import type { InventoryItem } from '@minebot/shared'

interface Props {
  items: InventoryItem[]
}

export function InventoryGrid({ items }: Props) {
  // Create 36-slot grid (9 columns x 4 rows)
  const slots = new Array(36).fill(null) as (InventoryItem | null)[]
  for (const item of items) {
    const idx = item.slot - 9 // Mineflayer inventory slots start at 9
    if (idx >= 0 && idx < 36) {
      slots[idx] = item
    }
  }

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>Inventario</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(9, 1fr)',
        gap: '4px',
      }}>
        {slots.map((item, i) => (
          <div
            key={i}
            title={item ? `${item.displayName} x${item.count}` : 'Vacio'}
            style={{
              aspectRatio: '1',
              background: item ? 'var(--bg-card)' : 'var(--bg-primary)',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.65rem',
              padding: '2px',
              overflow: 'hidden',
              border: item ? '1px solid var(--accent)' : '1px solid transparent',
            }}
          >
            {item && (
              <>
                <span style={{ textAlign: 'center', lineHeight: 1.1 }}>
                  {item.name.replace(/_/g, ' ').slice(0, 10)}
                </span>
                <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                  {item.count}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write ActivityFeed**

`apps/web/src/components/ActivityFeed.tsx`:
```tsx
import type { ActivityEvent } from '@minebot/shared'

interface Props {
  events: ActivityEvent[]
}

const typeColors: Record<ActivityEvent['type'], string> = {
  danger: 'var(--danger)',
  command: 'var(--command)',
  action: 'var(--success)',
  info: 'var(--text-secondary)',
}

export function ActivityFeed({ events }: Props) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: '12px',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <h2 style={{ marginBottom: '0.75rem' }}>Actividad</h2>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        maxHeight: '250px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}>
        {events.length === 0 && (
          <p style={{ color: 'var(--text-secondary)' }}>Sin actividad...</p>
        )}
        {events.map((event) => (
          <div key={event.id} style={{
            display: 'flex',
            gap: '0.5rem',
            fontSize: '0.85rem',
          }}>
            <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
              {new Date(event.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ color: typeColors[event.type] }}>
              {event.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write VoiceButton**

`apps/web/src/components/VoiceButton.tsx`:
```tsx
import type { VoiceState } from '../hooks/useVoiceRecognition'

interface Props {
  state: VoiceState
  isSupported: boolean
  onPointerDown: () => void
  onPointerUp: () => void
  onClick: () => void
}

const stateStyles: Record<VoiceState, { bg: string; label: string }> = {
  idle: { bg: 'var(--bg-card)', label: 'HABLAR' },
  listening: { bg: 'var(--danger)', label: 'ESCUCHANDO...' },
  processing: { bg: 'var(--warning)', label: 'PROCESANDO...' },
}

export function VoiceButton({ state, isSupported, onPointerDown, onPointerUp, onClick }: Props) {
  if (!isSupported) {
    return (
      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--danger)' }}>
        Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.
      </div>
    )
  }

  const { bg, label } = stateStyles[state]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <button
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onClick}
        style={{
          width: '140px',
          height: '140px',
          borderRadius: '50%',
          border: 'none',
          background: bg,
          color: 'var(--text-primary)',
          fontSize: '1rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: state === 'listening' ? '0 0 30px rgba(255,71,87,0.5)' : 'none',
          animation: state === 'listening' ? 'pulse 1.5s infinite' : 'none',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {label}
      </button>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
        Mantener = push-to-talk / Click = toggle
      </p>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 5: Write CommandDisplay**

`apps/web/src/components/CommandDisplay.tsx`:
```tsx
import type { CommandResponse } from '@minebot/shared'

interface Props {
  transcript: string
  response: CommandResponse | null
}

export function CommandDisplay({ transcript, response }: Props) {
  if (!transcript && !response) return null

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      {transcript && (
        <p style={{ marginBottom: '0.5rem' }}>
          <span style={{ color: 'var(--command)' }}>Tu: </span>
          "{transcript}"
        </p>
      )}
      {response && (
        <p>
          <span style={{ color: 'var(--success)' }}>Bot: </span>
          {response.understood}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Update Dashboard to compose all components**

Replace `apps/web/src/components/Dashboard.tsx`:
```tsx
import { useSocket } from '../hooks/useSocket'
import { useVoiceRecognition } from '../hooks/useVoiceRecognition'
import { StatsPanel } from './StatsPanel'
import { InventoryGrid } from './InventoryGrid'
import { ActivityFeed } from './ActivityFeed'
import { VoiceButton } from './VoiceButton'
import { CommandDisplay } from './CommandDisplay'

interface Props {
  token: string
  onLogout: () => void
}

export function Dashboard({ token, onLogout }: Props) {
  const { connected, botStatus, stats, inventory, activity, lastResponse, sendCommand } = useSocket(token)
  const { state: voiceState, transcript, startListening, stopListening, toggleListening, isSupported } = useVoiceRecognition(sendCommand)

  // Detect push-to-talk vs toggle via pointer timing
  let pointerDownTime = 0

  const handlePointerDown = () => {
    pointerDownTime = Date.now()
    startListening()
  }

  const handlePointerUp = () => {
    const held = Date.now() - pointerDownTime
    if (held > 300) {
      // Was holding — push-to-talk mode, stop now
      stopListening()
    }
    // If < 300ms, it was a click — handled by onClick
  }

  const handleClick = () => {
    const held = Date.now() - pointerDownTime
    if (held <= 300) {
      // Short click — toggle mode
      // startListening was called on pointerDown, so this is already listening
      // Next click will toggle off via toggleListening
      if (voiceState === 'listening') {
        stopListening()
      }
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100dvh',
      maxWidth: '600px',
      margin: '0 auto',
      padding: '1rem',
      gap: '1rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.25rem' }}>MineBot Control</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: connected ? 'var(--success)' : 'var(--danger)',
          }} />
          <button
            onClick={onLogout}
            style={{
              background: 'transparent',
              border: '1px solid var(--text-secondary)',
              color: 'var(--text-secondary)',
              padding: '0.25rem 0.75rem',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Salir
          </button>
        </div>
      </div>

      <StatsPanel stats={stats} botStatus={botStatus} />
      <InventoryGrid items={inventory} />
      <ActivityFeed events={activity} />
      <CommandDisplay transcript={transcript} response={lastResponse} />
      <VoiceButton
        state={voiceState}
        isSupported={isSupported}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
      />
    </div>
  )
}
```

- [ ] **Step 7: Verify frontend builds**

Run: `yarn workspace @minebot/web build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/
git commit -m "feat: add dashboard with stats, inventory, activity feed, and voice control"
```

---

## Task 12: Docker Deployment

**Files:**
- Create: `Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Write multi-stage Dockerfile**

`Dockerfile`:
```dockerfile
# Stage 1: Install + Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace config
COPY package.json yarn.lock turbo.json ./
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source
COPY apps/ apps/
COPY packages/ packages/

# Build shared types, then web (vite), then bot (tsc)
RUN yarn turbo build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/apps/bot/package.json apps/bot/
COPY --from=builder /app/packages/shared/package.json packages/shared/

# Install production deps only
RUN yarn install --frozen-lockfile --production

# Copy built outputs
COPY --from=builder /app/apps/bot/dist apps/bot/dist/
COPY --from=builder /app/apps/web/dist apps/web/dist/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/login || exit 1

EXPOSE 3001

CMD ["node", "apps/bot/dist/server.js"]
```

- [ ] **Step 2: Update docker-compose.yml**

Replace `docker-compose.yml`:
```yaml
services:
  minecraft:
    image: itzg/minecraft-server:java21
    container_name: minecraft
    environment:
      EULA: "TRUE"
      VERSION: "1.21.1"
      TYPE: PAPER
      MEMORY: "2G"
      JVM_XX_OPTS: "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200"
      DIFFICULTY: normal
      MODE: survival
      MOTD: "Mi servidor de Minecraft"
      MAX_PLAYERS: "10"
      VIEW_DISTANCE: "10"
      ONLINE_MODE: "false"
      WHITELIST: "Player1,MineBot"
      ENFORCE_WHITELIST: "TRUE"
      OPS: "Player1"
    ports:
      - "25565:25565"
    volumes:
      - ./data:/data
    deploy:
      resources:
        limits:
          memory: 2.5G
          cpus: "2.0"
    restart: unless-stopped
    healthcheck:
      test: mc-health
      start_period: 2m
      interval: 30s
      timeout: 10s
      retries: 3

  minebot:
    build: .
    container_name: minebot
    environment:
      ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"
      ACCESS_PASSWORD: "${ACCESS_PASSWORD}"
      JWT_SECRET: "${JWT_SECRET}"
      MINECRAFT_HOST: "minecraft"
      MINECRAFT_PORT: "25565"
      BOT_USERNAME: "MineBot"
      NODE_ENV: "production"
    ports:
      - "127.0.0.1:3001:3001"
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

- [ ] **Step 3: Create .env file from template**

Run: `cp /home/alore/proyectos/minecraft/.env.example /home/alore/proyectos/minecraft/.env`

Then edit `.env` with real values (user must fill in ANTHROPIC_API_KEY, ACCESS_PASSWORD, JWT_SECRET).

- [ ] **Step 4: Verify Docker build**

Run: `cd /home/alore/proyectos/minecraft && docker compose build minebot`
Expected: Multi-stage build completes

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example
git commit -m "feat: add Docker multi-stage build and updated compose with minebot service"
```

---

## Task 13: Integration Verification

- [ ] **Step 1: Run all unit tests**

Run: `yarn test`
Expected: All tests pass (auth + state machine + command parser)

- [ ] **Step 2: Start dev environment**

First check for existing processes:
```bash
ps aux | grep -E "nest.*(start|--watch)|tsx.*watch" | grep -v grep
```

Then start:
```bash
cd /home/alore/proyectos/minecraft && yarn dev
```

Expected: Bot server starts on :3001, Vite dev server on :5173

- [ ] **Step 3: Test auth flow**

Open browser to `http://localhost:5173`. Should see login page.
Enter the ACCESS_PASSWORD from `.env`. Should redirect to dashboard.

- [ ] **Step 4: Test bot connection**

Verify bot connects to Minecraft server (must be running via `docker compose up minecraft`).
Dashboard should show bot:connected status and stats updating every 1s.

- [ ] **Step 5: Test voice command**

Click the voice button, say "hola" in Spanish.
Should see transcript appear, Claude should respond, bot should execute `say` action in Minecraft chat.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: integration verification complete"
```
