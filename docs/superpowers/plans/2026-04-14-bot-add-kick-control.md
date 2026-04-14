# Bot Add/Kick Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al usuario agregar/expulsar el bot del servidor de Minecraft desde la UI, con la intención persistida en DB y respetada tras reinicios.

**Architecture:** Tabla `bot_config` (SQLite singleton) guarda `desiredState`. El módulo `bot/index.ts` gana flag `manualDisconnect` para suprimir auto-reconnect. Un módulo nuevo `bot/bot-control.ts` orquesta DB + runtime + broadcast. Se añaden eventos socket `bot:connect` / `bot:disconnect`. La UI reemplaza el indicador de status con un botón toggle (`BotControlButton`). Todos los puntos de extensión quedan marcados con `TODO(multi-bot):`.

**Tech Stack:** TypeScript, vitest, mineflayer, socket.io, better-sqlite3/drizzle, React 19, Vite.

**Reference Spec:** `docs/superpowers/specs/2026-04-14-bot-add-kick-control-design.md`

---

## File Structure

**Backend (apps/bot):**
- Create: `src/db/bot-config.ts` — helpers `getDesiredState`, `setDesiredState`.
- Create: `src/bot/bot-control.ts` — orquestación (`requestConnect`, `requestDisconnect`).
- Modify: `src/db/schema.ts` — agregar tabla `botConfig`.
- Modify: `src/db/index.ts` — auto-crear tabla `bot_config`.
- Modify: `src/bot/index.ts` — refactor a `connectBot/disconnectBot` con flag `manualDisconnect`.
- Modify: `src/socket/events.ts` — handlers `bot:connect` / `bot:disconnect`.
- Modify: `src/server.ts` — startup respeta `desiredState`.
- Create: `src/__tests__/bot-config.test.ts`
- Create: `src/__tests__/bot-runtime.test.ts`
- Create: `src/__tests__/bot-control.test.ts`

**Shared types (packages/shared):**
- Modify: `src/types.ts` — agregar `bot:connect`, `bot:disconnect` a `ClientToServerEvents`.

**Frontend (apps/web):**
- Create: `src/components/BotControlButton.tsx`
- Modify: `src/hooks/useSocket.ts` — exponer `connectBot`, `disconnectBot`.
- Modify: `src/components/Dashboard.tsx` — reemplazar indicador con `BotControlButton`.

**Docs:**
- Create: `docs/superpowers/plans/2026-04-14-multi-bot-roadmap.md` — roadmap futuro (placeholder ligero).

---

## Task 1: Extender tipos compartidos

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Agregar eventos nuevos al tipo `ClientToServerEvents`**

En `packages/shared/src/types.ts`, reemplazar el bloque existente:

```ts
export interface ClientToServerEvents {
  'voice:command': (command: VoiceCommand) => void
}
```

con:

```ts
export interface ClientToServerEvents {
  'voice:command': (command: VoiceCommand) => void
  // TODO(multi-bot): estos eventos recibirán { botId: string } en el futuro
  'bot:connect': () => void
  'bot:disconnect': () => void
}
```

- [ ] **Step 2: Rebuild shared**

Run: `yarn workspace @minebot/shared build`
Expected: build OK, `packages/shared/dist/types.d.ts` incluye los nuevos eventos.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/dist
git commit -m "feat(shared): add bot:connect/bot:disconnect socket events"
```

---

## Task 2: Schema de DB — tabla `bot_config`

**Files:**
- Modify: `apps/bot/src/db/schema.ts`
- Modify: `apps/bot/src/db/index.ts`

- [ ] **Step 1: Agregar tabla al schema**

En `apps/bot/src/db/schema.ts`, al final del archivo agregar:

```ts
// TODO(multi-bot): cuando soportemos varios bots, esta tabla pasa a tener
// múltiples filas con columnas: name, host, port, username.
export const botConfig = sqliteTable('bot_config', {
  id: integer('id').primaryKey(),                  // singleton: siempre 1
  desiredState: text('desired_state').notNull(),   // 'connected' | 'disconnected'
  updatedAt: integer('updated_at').notNull(),      // unix ms
})
```

- [ ] **Step 2: Auto-crear la tabla en startup**

En `apps/bot/src/db/index.ts`, después del bloque `CREATE TABLE IF NOT EXISTS activity_events` (línea ~37-44), agregar:

```ts
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS bot_config (
    id INTEGER PRIMARY KEY,
    desired_state TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
```

- [ ] **Step 3: Commit**

```bash
git add apps/bot/src/db/schema.ts apps/bot/src/db/index.ts
git commit -m "feat(bot): add bot_config table for desired-state persistence"
```

---

## Task 3: Helpers `bot-config.ts` (TDD)

**Files:**
- Create: `apps/bot/src/__tests__/bot-config.test.ts`
- Create: `apps/bot/src/db/bot-config.ts`

- [ ] **Step 1: Escribir tests fallidos**

Crear `apps/bot/src/__tests__/bot-config.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema.js'
import { getDesiredState, setDesiredState } from '../db/bot-config.js'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE bot_config (
      id INTEGER PRIMARY KEY,
      desired_state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  return drizzle(sqlite, { schema })
}

describe('bot-config', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  describe('getDesiredState', () => {
    it('returns "connected" by default when table is empty', () => {
      expect(getDesiredState(db)).toBe('connected')
    })

    it('returns the persisted value after a write', () => {
      setDesiredState(db, 'disconnected')
      expect(getDesiredState(db)).toBe('disconnected')
    })
  })

  describe('setDesiredState', () => {
    it('persists "disconnected"', () => {
      setDesiredState(db, 'disconnected')
      expect(getDesiredState(db)).toBe('disconnected')
    })

    it('overwrites previous value', () => {
      setDesiredState(db, 'disconnected')
      setDesiredState(db, 'connected')
      expect(getDesiredState(db)).toBe('connected')
    })

    it('updates updatedAt on each write', async () => {
      setDesiredState(db, 'disconnected')
      const rows1 = db.select().from(schema.botConfig).all()
      const t1 = rows1[0].updatedAt

      await new Promise(r => setTimeout(r, 5))
      setDesiredState(db, 'connected')
      const rows2 = db.select().from(schema.botConfig).all()
      expect(rows2[0].updatedAt).toBeGreaterThan(t1)
    })
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallen**

Run: `yarn workspace @minebot/bot test bot-config`
Expected: FAIL con "Cannot find module '../db/bot-config.js'".

- [ ] **Step 3: Implementar `bot-config.ts`**

Crear `apps/bot/src/db/bot-config.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { botConfig } from './schema.js'
import type * as schema from './schema.js'

type Db = BetterSQLite3Database<typeof schema>

// TODO(multi-bot): agregar parámetro `botId: string` en todas las funciones.
export type DesiredState = 'connected' | 'disconnected'

const SINGLETON_ID = 1

export function getDesiredState(db: Db): DesiredState {
  const row = db
    .select()
    .from(botConfig)
    .where(eq(botConfig.id, SINGLETON_ID))
    .get()

  if (!row) return 'connected'
  return row.desiredState as DesiredState
}

export function setDesiredState(db: Db, state: DesiredState): void {
  const now = Date.now()
  const existing = db
    .select()
    .from(botConfig)
    .where(eq(botConfig.id, SINGLETON_ID))
    .get()

  if (existing) {
    db.update(botConfig)
      .set({ desiredState: state, updatedAt: now })
      .where(eq(botConfig.id, SINGLETON_ID))
      .run()
  } else {
    db.insert(botConfig)
      .values({ id: SINGLETON_ID, desiredState: state, updatedAt: now })
      .run()
  }
}
```

- [ ] **Step 4: Correr tests y verificar que pasen**

Run: `yarn workspace @minebot/bot test bot-config`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/db/bot-config.ts apps/bot/src/__tests__/bot-config.test.ts
git commit -m "feat(bot): add bot-config DB helpers with tests"
```

---

## Task 4: Refactor `bot/index.ts` — funciones explícitas + flag manual

**Files:**
- Modify: `apps/bot/src/bot/index.ts`

Este task no tiene tests unitarios aún (llegan en Task 5 con mock de mineflayer). Es un refactor directo.

- [ ] **Step 1: Reemplazar el contenido completo de `bot/index.ts`**

Sobreescribir `apps/bot/src/bot/index.ts`:

```ts
import mineflayer, { type Bot } from 'mineflayer'
import { loadPlugins } from './plugins.js'

export interface BotConfig {
  host: string
  port: number
  username: string
}

// TODO(multi-bot): reemplazar por un mapa indexado por botId.
let bot: Bot | null = null
let savedConfig: BotConfig | null = null
let manualDisconnect = false

const RESISTANCE_APPLY_DELAY_MS = 1500
const AUTO_RECONNECT_DELAY_MS = 5000

export function getBot(): Bot | null {
  return bot
}

export function getBotConfig(): BotConfig | null {
  return savedConfig
}

export function connectBot(config: BotConfig): Bot {
  // Si ya hay una instancia, descartarla sin disparar auto-reconnect logico
  if (bot) {
    manualDisconnect = true      // suprime reconnect del 'end' handler de la instancia vieja
    bot.quit()
    bot = null
  }

  console.log(`[Bot] Connecting as ${config.username} to ${config.host}:${config.port}`)

  savedConfig = config
  manualDisconnect = false

  bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    auth: 'offline',
  })

  loadPlugins(bot)
  attachLifecycleLogs(bot)
  attachReconnectHandler(bot)

  return bot
}

export function disconnectBot(): void {
  if (!bot) return

  console.log('[Bot] Manual disconnect requested')
  manualDisconnect = true
  bot.quit()
  bot = null
}

function attachLifecycleLogs(currentBot: Bot): void {
  currentBot.on('login', () => {
    console.log('[Bot] Logged in successfully')
  })

  currentBot.on('spawn', () => {
    console.log('[Bot] Spawned in world')
    setTimeout(() => applyResistanceEffect(currentBot), RESISTANCE_APPLY_DELAY_MS)
  })

  currentBot.on('death', () => {
    console.log('[Bot] Died, will respawn')
  })

  currentBot.on('kicked', (reason) => {
    console.log(`[Bot] Kicked: ${reason}`)
  })

  currentBot.on('error', (err) => {
    console.error('[Bot] Error:', err.message)
  })
}

function attachReconnectHandler(currentBot: Bot): void {
  currentBot.on('end', (reason) => {
    console.log(`[Bot] Disconnected: ${reason}`)
    bot = null

    if (manualDisconnect) {
      console.log('[Bot] Manual disconnect — skipping auto-reconnect')
      return
    }

    if (!savedConfig) {
      console.log('[Bot] No saved config — skipping auto-reconnect')
      return
    }

    console.log(`[Bot] Auto-reconnecting in ${AUTO_RECONNECT_DELAY_MS}ms...`)
    setTimeout(() => connectBot(savedConfig!), AUTO_RECONNECT_DELAY_MS)
  })
}

function applyResistanceEffect(currentBot: Bot): void {
  try {
    currentBot.chat('/effect give @s minecraft:resistance infinite 255 true')
    console.log('[Bot] Applied resistance immunity')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Bot] Could not apply resistance effect:', msg)
  }
}
```

- [ ] **Step 2: Verificar que el build compila**

Run: `yarn workspace @minebot/bot build`
Expected: compila sin errores TypeScript.

Nota: esto rompe temporalmente `server.ts` porque importa `createBot` (que ya no existe). Lo arreglamos en el siguiente step. No commitear todavía.

- [ ] **Step 3: Preparar imports en `server.ts` para que compile**

Editar `apps/bot/src/server.ts` línea 10 — cambiar:

```ts
import { createBot } from './bot/index.js'
```

a:

```ts
import { connectBot, getBotConfig } from './bot/index.js'
```

Y en la línea 98, cambiar:

```ts
const bot = createBot({ host, port, username })
```

a:

```ts
const bot = connectBot({ host, port, username })
```

- [ ] **Step 4: Verificar build**

Run: `yarn workspace @minebot/bot build`
Expected: compila sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/bot/index.ts apps/bot/src/server.ts
git commit -m "refactor(bot): split createBot into connectBot/disconnectBot with manual flag"
```

---

## Task 5: Tests del runtime (mock mineflayer)

**Files:**
- Create: `apps/bot/src/__tests__/bot-runtime.test.ts`

Los tests mockean `mineflayer.createBot` para verificar el lifecycle sin tocar red real.

- [ ] **Step 1: Escribir tests fallidos**

Crear `apps/bot/src/__tests__/bot-runtime.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'

// Mock mineflayer BEFORE importing the module under test
const createBotMock = vi.fn()
vi.mock('mineflayer', () => ({
  default: { createBot: (...args: unknown[]) => createBotMock(...args) },
  createBot: (...args: unknown[]) => createBotMock(...args),
}))
vi.mock('../bot/plugins.js', () => ({
  loadPlugins: vi.fn(),
}))

// Dynamic import so mocks apply
const { connectBot, disconnectBot, getBot, getBotConfig } = await import('../bot/index.js')

interface FakeBot extends EventEmitter {
  quit: ReturnType<typeof vi.fn>
  chat: ReturnType<typeof vi.fn>
}

function makeFakeBot(): FakeBot {
  const emitter = new EventEmitter() as FakeBot
  emitter.quit = vi.fn(() => emitter.emit('end', 'quit called'))
  emitter.chat = vi.fn()
  return emitter
}

describe('bot runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    createBotMock.mockReset()
    // Reset module state by disconnecting any previous bot
    disconnectBot()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('connectBot creates a mineflayer bot and stores config', () => {
    const fake = makeFakeBot()
    createBotMock.mockReturnValue(fake)

    const bot = connectBot({ host: 'localhost', port: 25565, username: 'TestBot' })

    expect(createBotMock).toHaveBeenCalledWith(expect.objectContaining({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      auth: 'offline',
    }))
    expect(bot).toBe(fake)
    expect(getBot()).toBe(fake)
    expect(getBotConfig()).toEqual({ host: 'localhost', port: 25565, username: 'TestBot' })
  })

  it('disconnectBot calls quit and clears bot', () => {
    const fake = makeFakeBot()
    createBotMock.mockReturnValue(fake)
    connectBot({ host: 'localhost', port: 25565, username: 'TestBot' })

    disconnectBot()

    expect(fake.quit).toHaveBeenCalled()
    expect(getBot()).toBeNull()
  })

  it('does NOT auto-reconnect after a manual disconnect', () => {
    const fake = makeFakeBot()
    createBotMock.mockReturnValue(fake)
    connectBot({ host: 'localhost', port: 25565, username: 'TestBot' })

    createBotMock.mockClear()
    disconnectBot()

    vi.advanceTimersByTime(10000) // mas alla del delay de reconnect
    expect(createBotMock).not.toHaveBeenCalled()
  })

  it('auto-reconnects after a non-manual end event', () => {
    const fake = makeFakeBot()
    createBotMock.mockReturnValueOnce(fake)
    connectBot({ host: 'localhost', port: 25565, username: 'TestBot' })

    // Simular caida de red (no manual)
    const fake2 = makeFakeBot()
    createBotMock.mockReturnValueOnce(fake2)
    fake.emit('end', 'network error')

    vi.advanceTimersByTime(5000)
    expect(createBotMock).toHaveBeenCalledTimes(2)
    expect(getBot()).toBe(fake2)
  })

  it('calling connectBot while a bot exists replaces it without triggering auto-reconnect', () => {
    const fake1 = makeFakeBot()
    const fake2 = makeFakeBot()
    createBotMock.mockReturnValueOnce(fake1).mockReturnValueOnce(fake2)

    connectBot({ host: 'localhost', port: 25565, username: 'Bot1' })
    connectBot({ host: 'localhost', port: 25565, username: 'Bot2' })

    expect(fake1.quit).toHaveBeenCalled()
    expect(getBot()).toBe(fake2)

    // Advance timers: the old fake1's 'end' fired but shouldn't schedule reconnect
    createBotMock.mockClear()
    vi.advanceTimersByTime(10000)
    expect(createBotMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr tests y verificar que pasen**

Run: `yarn workspace @minebot/bot test bot-runtime`
Expected: PASS (5 tests).

Si algún test falla, el refactor de Task 4 tiene un bug. Arreglarlo en `bot/index.ts` antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add apps/bot/src/__tests__/bot-runtime.test.ts
git commit -m "test(bot): cover connectBot/disconnectBot lifecycle and reconnect guard"
```

---

## Task 6: Orquestación `bot-control.ts` (TDD)

**Files:**
- Create: `apps/bot/src/__tests__/bot-control.test.ts`
- Create: `apps/bot/src/bot/bot-control.ts`

Este módulo coordina DB + runtime + broadcast. Se mockean el runtime y el IO.

- [ ] **Step 1: Escribir tests fallidos**

Crear `apps/bot/src/__tests__/bot-control.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema.js'
import { getDesiredState, setDesiredState } from '../db/bot-config.js'

const connectBotMock = vi.fn()
const disconnectBotMock = vi.fn()
const getBotMock = vi.fn()

vi.mock('../bot/index.js', () => ({
  connectBot: (...args: unknown[]) => connectBotMock(...args),
  disconnectBot: () => disconnectBotMock(),
  getBot: () => getBotMock(),
  getBotConfig: () => null,
}))

const { requestConnect, requestDisconnect } = await import('../bot/bot-control.js')

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE bot_config (
      id INTEGER PRIMARY KEY,
      desired_state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  return drizzle(sqlite, { schema })
}

function makeFakeIo() {
  return { emit: vi.fn() }
}

describe('bot-control', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    connectBotMock.mockReset()
    disconnectBotMock.mockReset()
    getBotMock.mockReset()
  })

  describe('requestConnect', () => {
    it('sets desiredState to "connected" and calls connectBot', async () => {
      setDesiredState(db, 'disconnected')
      const io = makeFakeIo()
      const config = { host: 'localhost', port: 25565, username: 'TestBot' }

      await requestConnect(io as any, db, config)

      expect(getDesiredState(db)).toBe('connected')
      expect(connectBotMock).toHaveBeenCalledWith(config)
    })

    it('emits connecting status during transition', async () => {
      setDesiredState(db, 'disconnected')
      const io = makeFakeIo()

      await requestConnect(io as any, db, { host: 'localhost', port: 25565, username: 'TestBot' })

      expect(io.emit).toHaveBeenCalledWith('bot:status', 'connecting')
    })

    it('is a no-op when already connected', async () => {
      setDesiredState(db, 'connected')
      getBotMock.mockReturnValue({ entity: {} })
      const io = makeFakeIo()

      await requestConnect(io as any, db, { host: 'localhost', port: 25565, username: 'TestBot' })

      expect(connectBotMock).not.toHaveBeenCalled()
    })
  })

  describe('requestDisconnect', () => {
    it('sets desiredState to "disconnected" and calls disconnectBot', async () => {
      setDesiredState(db, 'connected')
      getBotMock.mockReturnValue({ entity: {} })
      const io = makeFakeIo()

      await requestDisconnect(io as any, db)

      expect(getDesiredState(db)).toBe('disconnected')
      expect(disconnectBotMock).toHaveBeenCalled()
    })

    it('emits disconnected status after disconnect', async () => {
      setDesiredState(db, 'connected')
      getBotMock.mockReturnValue({ entity: {} })
      const io = makeFakeIo()

      await requestDisconnect(io as any, db)

      expect(io.emit).toHaveBeenCalledWith('bot:status', 'disconnected')
    })

    it('is a no-op when already disconnected', async () => {
      setDesiredState(db, 'disconnected')
      getBotMock.mockReturnValue(null)
      const io = makeFakeIo()

      await requestDisconnect(io as any, db)

      expect(disconnectBotMock).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Correr tests y verificar que fallen**

Run: `yarn workspace @minebot/bot test bot-control`
Expected: FAIL con "Cannot find module '../bot/bot-control.js'".

- [ ] **Step 3: Implementar `bot-control.ts`**

Crear `apps/bot/src/bot/bot-control.ts`:

```ts
import type { Server } from 'socket.io'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { ServerToClientEvents, ClientToServerEvents } from '@minebot/shared'
import * as schema from '../db/schema.js'
import { getDesiredState, setDesiredState } from '../db/bot-config.js'
import { connectBot, disconnectBot, getBot, type BotConfig } from './index.js'

type TypedIO = Server<ClientToServerEvents, ServerToClientEvents>
type Db = BetterSQLite3Database<typeof schema>
type LifecycleWirer = (bot: ReturnType<typeof connectBot>) => void

// TODO(multi-bot): estas funciones recibiran `botId: string` ademas de db/io/config.

export async function requestConnect(
  io: TypedIO,
  db: Db,
  config: BotConfig,
  wireLifecycle?: LifecycleWirer,
): Promise<void> {
  if (isAlreadyConnected(db)) {
    console.log('[bot-control] Connect requested but already connected — no-op')
    return
  }

  io.emit('bot:status', 'connecting')
  setDesiredState(db, 'connected')
  const bot = connectBot(config)
  wireLifecycle?.(bot)
  // El broadcast final de 'connected' lo hace el handler de spawn (wireLifecycle).
}

export async function requestDisconnect(io: TypedIO, db: Db): Promise<void> {
  if (isAlreadyDisconnected(db)) {
    console.log('[bot-control] Disconnect requested but already disconnected — no-op')
    return
  }

  setDesiredState(db, 'disconnected')
  disconnectBot()
  io.emit('bot:status', 'disconnected')
}

function isAlreadyConnected(db: Db): boolean {
  return getDesiredState(db) === 'connected' && getBot()?.entity != null
}

function isAlreadyDisconnected(db: Db): boolean {
  return getDesiredState(db) === 'disconnected' && getBot() == null
}
```

- [ ] **Step 4: Correr tests y verificar que pasen**

Run: `yarn workspace @minebot/bot test bot-control`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/bot/bot-control.ts apps/bot/src/__tests__/bot-control.test.ts
git commit -m "feat(bot): add bot-control orchestration layer with tests"
```

---

## Task 7: Socket handlers y wire-up de lifecycle

**Files:**
- Modify: `apps/bot/src/socket/events.ts`

- [ ] **Step 1: Agregar imports y helper**

En `apps/bot/src/socket/events.ts`, agregar junto a los imports existentes (línea 1-19):

```ts
import { requestConnect, requestDisconnect } from '../bot/bot-control.js'
import { getBotConfig } from '../bot/index.js'
```

- [ ] **Step 2: Cambiar firma de `setupSocketBridge`**

Editar la firma de `setupSocketBridge` en `apps/bot/src/socket/events.ts` (línea ~74-77) para aceptar un `wireLifecycle`:

```ts
export function setupSocketBridge(
  io: TypedIO,
  wireLifecycle: (bot: Bot) => void,
): {
  startBotListeners: (bot: Bot) => void
  stopBotListeners: () => void
} {
```

- [ ] **Step 3: Agregar handlers dentro de `io.on('connection')`**

En `apps/bot/src/socket/events.ts`, después del handler `socket.on('disconnect', ...)` (línea ~107-110) y antes de `socket.on('voice:command', ...)`, insertar:

```ts
    // TODO(multi-bot): recibir botId del payload y enrutarlo al bot correcto.
    socket.on('bot:connect', async () => {
      const config = getBotConfig() ?? readBotConfigFromEnv()
      await requestConnect(io, getDb(), config, wireLifecycle)
    })

    socket.on('bot:disconnect', async () => {
      await requestDisconnect(io, getDb())
    })
```

- [ ] **Step 4: Agregar helper `readBotConfigFromEnv`**

Al final de `apps/bot/src/socket/events.ts`, después del cierre de `setupSocketBridge`:

```ts
function readBotConfigFromEnv(): { host: string; port: number; username: string } {
  return {
    host: process.env.MINECRAFT_HOST ?? 'localhost',
    port: Number(process.env.MINECRAFT_PORT) || 25565,
    username: process.env.BOT_USERNAME ?? 'MineBot',
  }
}
```

- [ ] **Step 5: Verificar build**

Run: `yarn workspace @minebot/bot build`
Expected: compila sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/socket/events.ts
git commit -m "feat(bot): wire bot:connect/bot:disconnect socket handlers"
```

---

## Task 8: Startup respeta `desiredState`

**Files:**
- Modify: `apps/bot/src/server.ts`

- [ ] **Step 1: Agregar imports y refactor de startup**

En `apps/bot/src/server.ts`, agregar el import (línea ~13):

```ts
import { getDesiredState } from './db/bot-config.js'
```

- [ ] **Step 2: Reemplazar el bloque `server.listen(...)` completo**

Reemplazar `server.listen(PORT, () => { ... })` (líneas 90-116) con:

```ts
function wireBotLifecycleBroadcasts(bot: ReturnType<typeof connectBot>): void {
  bot.on('spawn', () => {
    stopBotListeners()
    startBotListeners(bot)
  })

  bot.on('end', () => {
    stopBotListeners()
    io.emit('bot:status', 'disconnected')
  })

  bot.on('kicked', () => {
    stopBotListeners()
    io.emit('bot:status', 'disconnected')
  })
}

server.listen(PORT, () => {
  console.log(`MineBot server running on port ${PORT}`)

  const host = process.env.MINECRAFT_HOST ?? 'localhost'
  const port = Number(process.env.MINECRAFT_PORT) || 25565
  const username = process.env.BOT_USERNAME ?? 'MineBot'
  const config = { host, port, username }

  // TODO(multi-bot): iterar todos los bots guardados, arrancando los que estan 'connected'.
  const desired = getDesiredState(getDb())
  if (desired === 'disconnected') {
    console.log('[Bot] desiredState=disconnected at startup; waiting for user action')
    io.emit('bot:status', 'disconnected')
    return
  }

  const bot = connectBot(config)
  wireBotLifecycleBroadcasts(bot)
})
```

- [ ] **Step 3: Ajustar la llamada a `setupSocketBridge`**

En `apps/bot/src/server.ts`, mover/ajustar la llamada a `setupSocketBridge`. Esta debe venir **antes** de `server.listen` pero `wireBotLifecycleBroadcasts` la necesita también.

Solución: declarar `wireBotLifecycleBroadcasts` como function declaration (hoisted) arriba del archivo, y ajustar la línea 86 para pasarla:

```ts
const { startBotListeners, stopBotListeners } = setupSocketBridge(io, wireBotLifecycleBroadcasts)
```

La function declaration (no `const`/arrow) se hoistea, así que se puede referenciar antes de donde está escrita. Ubicarla físicamente arriba del `setupSocketBridge` call para legibilidad (Stepdown Rule de Clean Code).

- [ ] **Step 4: Verificar build y tests**

Run: `yarn workspace @minebot/bot build && yarn workspace @minebot/bot test`
Expected: build OK, todos los tests pasan.

- [ ] **Step 5: Agregar test que cubre el `wireLifecycle` callback**

En `apps/bot/src/__tests__/bot-control.test.ts`, dentro del `describe('requestConnect', ...)`, agregar:

```ts
it('invokes the wireLifecycle callback with the new bot', async () => {
  setDesiredState(db, 'disconnected')
  const fakeBot = { on: vi.fn() }
  connectBotMock.mockReturnValue(fakeBot)
  const wireLifecycle = vi.fn()
  const io = makeFakeIo()

  await requestConnect(io as any, db, { host: 'localhost', port: 25565, username: 'T' }, wireLifecycle)

  expect(wireLifecycle).toHaveBeenCalledWith(fakeBot)
})
```

Run: `yarn workspace @minebot/bot test bot-control`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/server.ts apps/bot/src/__tests__/bot-control.test.ts
git commit -m "feat(bot): startup respects desiredState; wire lifecycle on reconnect"
```

---

## Task 9: Hook `useSocket` expone `connectBot` / `disconnectBot`

**Files:**
- Modify: `apps/web/src/hooks/useSocket.ts`

- [ ] **Step 1: Agregar métodos**

En `apps/web/src/hooks/useSocket.ts`, después de la definición de `sendCommand` (línea 121-124):

```ts
  const connectBot = useCallback(() => {
    socketRef.current?.emit('bot:connect')
  }, [])

  const disconnectBot = useCallback(() => {
    socketRef.current?.emit('bot:disconnect')
  }, [])
```

Y en el `return` (línea 126-137), agregar los nuevos campos:

```ts
  return {
    connected,
    botStatus,
    stats,
    inventory,
    activity,
    lastResponse,
    sendCommand,
    connectBot,
    disconnectBot,
    loadMoreActivity,
    hasMoreActivity,
    loadingActivity,
  }
```

- [ ] **Step 2: Verificar build**

Run: `yarn workspace @minebot/web build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useSocket.ts
git commit -m "feat(web): expose connectBot/disconnectBot from useSocket"
```

---

## Task 10: Componente `BotControlButton`

**Files:**
- Create: `apps/web/src/components/BotControlButton.tsx`

- [ ] **Step 1: Crear el componente**

Crear `apps/web/src/components/BotControlButton.tsx`:

```tsx
import type { BotStatus } from '@minebot/shared'

// TODO(multi-bot): recibir `botName` ademas de status, y mostrar el nombre del bot seleccionado.
interface Props {
  status: BotStatus
  onConnect: () => void
  onDisconnect: () => void
}

interface Visuals {
  label: string
  background: string
  disabled: boolean
  action: 'connect' | 'disconnect' | null
}

function resolveVisuals(status: BotStatus): Visuals {
  switch (status) {
    case 'connecting':
      return { label: 'CONECTANDO', background: 'var(--mc-warning)', disabled: true, action: null }
    case 'connected':
      return { label: 'EXPULSAR', background: 'var(--mc-success)', disabled: false, action: 'disconnect' }
    case 'dead':
      return { label: 'EXPULSAR', background: 'var(--mc-warning)', disabled: false, action: 'disconnect' }
    case 'disconnected':
    default:
      return { label: 'AGREGAR', background: 'var(--mc-danger)', disabled: false, action: 'connect' }
  }
}

export function BotControlButton({ status, onConnect, onDisconnect }: Props) {
  const visuals = resolveVisuals(status)

  const handleClick = () => {
    if (visuals.action === 'connect') onConnect()
    else if (visuals.action === 'disconnect') onDisconnect()
  }

  return (
    <button
      onClick={handleClick}
      disabled={visuals.disabled}
      className="mc-btn"
      style={{
        fontSize: '0.4rem',
        padding: '0.4rem 0.8rem',
        background: visuals.background,
        opacity: visuals.disabled ? 0.6 : 1,
        cursor: visuals.disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {visuals.label}
    </button>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `yarn workspace @minebot/web build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/BotControlButton.tsx
git commit -m "feat(web): add BotControlButton component with status-driven visuals"
```

---

## Task 11: Integrar `BotControlButton` en Dashboard

**Files:**
- Modify: `apps/web/src/components/Dashboard.tsx`

- [ ] **Step 1: Importar el componente**

En `apps/web/src/components/Dashboard.tsx`, agregar junto a otros imports (línea 1-9):

```ts
import { BotControlButton } from './BotControlButton'
```

- [ ] **Step 2: Extraer `connectBot`/`disconnectBot` del hook**

En `apps/web/src/components/Dashboard.tsx` línea 17, cambiar:

```ts
const { connected, botStatus, stats, inventory, activity, lastResponse, sendCommand, loadMoreActivity, hasMoreActivity, loadingActivity } = useSocket(token)
```

a:

```ts
const { connected, botStatus, stats, inventory, activity, lastResponse, sendCommand, connectBot, disconnectBot, loadMoreActivity, hasMoreActivity, loadingActivity } = useSocket(token)
```

- [ ] **Step 3: Reemplazar el indicador de status con el botón**

En `apps/web/src/components/Dashboard.tsx`, reemplazar el bloque (líneas 88-95):

```tsx
<span style={{
  width: '8px',
  height: '8px',
  background: connected ? 'var(--mc-success)' : 'var(--mc-danger)',
  display: 'inline-block',
  imageRendering: 'pixelated',
  boxShadow: connected ? '0 0 6px rgba(85,255,85,0.5)' : 'none',
}} />
```

con:

```tsx
<BotControlButton
  status={botStatus}
  onConnect={connectBot}
  onDisconnect={disconnectBot}
/>
```

- [ ] **Step 4: Verificar build**

Run: `yarn workspace @minebot/web build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Dashboard.tsx
git commit -m "feat(web): replace status dot with BotControlButton in Dashboard"
```

---

## Task 12: Verificación manual end-to-end

**Files:** ninguno (verificación en navegador).

Dado que `apps/web` no tiene setup de tests de componentes React (Vitest + RTL), la validación de UI es manual. Este task es un checklist.

- [ ] **Step 1: Arrancar el entorno en modo dev**

Run: `yarn dev`
Esperar a que tanto `apps/bot` como `apps/web` levanten (turbo lo hace en paralelo).

- [ ] **Step 2: Verificar flujo 1 (arranque limpio)**

1. Abrir el puerto Vite (típicamente `http://localhost:5173`).
2. Loguearse.
3. En el header, donde antes estaba el puntito verde, ahora aparece un botón `EXPULSAR` (verde).
4. Esperar unos segundos → bot se conecta → status = `connected` → label sigue `EXPULSAR`.

- [ ] **Step 3: Verificar flujo 2 (expulsar)**

1. Click en `EXPULSAR`.
2. Label cambia a `AGREGAR` (rojo).
3. En el servidor Minecraft (consola o cliente), confirmar que el bot efectivamente salió.
4. Verificar la DB consultando la tabla `bot_config` con cualquier herramienta (drizzle studio, sqlite shell, o un script ad-hoc). Debe mostrar `id=1, desired_state=disconnected`.

- [ ] **Step 4: Verificar flujo 4 (reinicio respeta intención)**

1. Con el bot expulsado, reiniciar el backend: Ctrl+C en `yarn dev`, volver a correr.
2. Re-abrir el frontend.
3. Botón muestra `AGREGAR` (rojo). Bot NO entró al servidor Minecraft automáticamente.

- [ ] **Step 5: Verificar flujo 3 (agregar)**

1. Click en `AGREGAR`.
2. Label cambia a `CONECTANDO` (amarillo, disabled) y luego `EXPULSAR` (verde) cuando entra.
3. En Minecraft, confirmar que el bot apareció.
4. Verificar DB: `desired_state=connected`.

- [ ] **Step 6: Verificar flujo 5 (auto-reconnect tras fallo de red)**

1. Con el bot conectado, parar el server de Minecraft.
2. Backend loggea la desconexión, frontend muestra `AGREGAR` brevemente, y ~5s después el backend intenta reconectar.
3. Levantar Minecraft de nuevo. Bot debe volver a entrar sin intervención del usuario.

- [ ] **Step 7: Reporte**

Documentar en la conversación cualquier comportamiento inesperado. Si todo pasa, marcar este task completado.

- [ ] **Step 8: Commit (solo si hubo ajustes menores durante la verificación)**

Si durante los pasos 2-6 hubo que retocar estilos o copys:

```bash
git add .
git commit -m "fix(web): minor UX tweaks from manual QA"
```

---

## Task 13: Documentar el roadmap multi-bot

**Files:**
- Create: `docs/superpowers/plans/2026-04-14-multi-bot-roadmap.md`

- [ ] **Step 1: Escribir el roadmap**

Crear `docs/superpowers/plans/2026-04-14-multi-bot-roadmap.md`:

```markdown
# Multi-Bot Roadmap (Futuro)

**Estado:** Placeholder — no se planifica en esta iteración.

Esta nota captura los puntos del código que quedan preparados para cuando querramos soportar múltiples bots simultáneos (cada uno con su propia personalidad/acciones).

## Puntos de extensión ya marcados

Todos los archivos siguientes tienen un comentario `TODO(multi-bot):` que describe el cambio específico cuando llegue el momento:

- `apps/bot/src/db/schema.ts` — tabla `bot_config` pasa de fila singleton a fila-por-bot; agrega `name`, `host`, `port`, `username`.
- `apps/bot/src/db/bot-config.ts` — helpers reciben `botId: string`.
- `apps/bot/src/bot/index.ts` — el runtime pasa de singleton a registry `Map<botId, BotRuntime>`.
- `apps/bot/src/bot/bot-control.ts` — `requestConnect/requestDisconnect` reciben `botId`.
- `apps/bot/src/socket/events.ts` — eventos socket con payload `{ botId: string }`.
- `apps/bot/src/server.ts` — startup itera los bots persistidos.
- `packages/shared/src/types.ts` — `ClientToServerEvents` recibe `botId`.
- `apps/web/src/components/Dashboard.tsx` — botón único pasa a selector + panel por bot.

## Pasos de alto nivel para implementar

1. Schema migration: `bot_config` → filas por bot.
2. Refactor runtime a registry.
3. Extender socket events con `botId`.
4. UI: selector de bot activo + panel por bot.
5. Persistir config (host/port/username) editable por UI — feature (b) que quedó fuera del primer diseño.

## Decisiones a revisitar

- Un proceso por bot o uno compartido (simplicidad vs aislamiento de crash).
- Permisos/roles por bot — sólo admin puede agregar nuevos.
- Escalado del pipeline de conversación/memoria — un directorio por bot probablemente.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-04-14-multi-bot-roadmap.md
git commit -m "docs: add multi-bot roadmap placeholder"
```

---

## Self-Review — coverage del spec

| Sección del spec                                 | Task(s)                  |
|--------------------------------------------------|--------------------------|
| Tabla `bot_config` en schema + auto-create       | Task 2                   |
| Helpers `getDesiredState/setDesiredState`        | Task 3                   |
| Runtime refactor (connect/disconnect + flag)     | Task 4                   |
| Tests del runtime                                | Task 5                   |
| Orquestación `bot-control`                       | Task 6                   |
| Tests de orquestación                            | Task 6, 8                |
| Handlers socket                                  | Task 7                   |
| Tipos compartidos                                | Task 1                   |
| Startup respeta desiredState                     | Task 8                   |
| UI — useSocket expone connect/disconnect         | Task 9                   |
| UI — componente `BotControlButton`               | Task 10                  |
| UI — integración en Dashboard                    | Task 11                  |
| Tests UI (React)                                 | (skip — no hay setup RTL; verificación manual en Task 12) |
| TODOs multi-bot                                  | Tasks 1, 2, 3, 4, 7, 8, 10 + Task 13 |
| QA manual end-to-end                             | Task 12                  |
| Criterios de éxito                               | Tasks 5, 6, 8, 12        |

No hay gaps. El plan está listo para ejecución.
