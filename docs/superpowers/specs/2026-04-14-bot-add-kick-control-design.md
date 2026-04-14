# Spec — Control manual del bot (agregar / expulsar)

**Fecha:** 2026-04-14
**Autor:** Kevin Jovy + Claude
**Estado:** Propuesto

## Motivación

Actualmente el bot se conecta automáticamente al arrancar el servidor y se reconecta solo tras cualquier desconexión. No hay forma desde la UI de pedirle que se salga del servidor, ni de volver a entrarlo después. Este spec define la primera iteración de control manual: **agregar** (conectar) y **expulsar** (desconectar) el bot.

Esta feature es también el primer paso hacia el soporte multi-bot en el futuro. El diseño deja **abiertos puntos de extensión claros** (TODOs marcados) para que el upgrade sea incremental, no un rewrite.

## Alcance

### In scope (esta iteración)

1. Tabla `bot_config` en SQLite que persiste la intención del usuario (`connected` | `disconnected`).
2. Módulo `bot/index.ts` refactorizado: funciones explícitas `connectBot()` / `disconnectBot()`, con flag de "desconexión manual" que suprime la reconexión automática.
3. Startup del servidor respeta el último `desiredState` persistido.
4. Eventos de socket `bot:connect` y `bot:disconnect` desde el cliente.
5. UI: botón toggle en el header (reemplaza el indicador de estado actual).
6. Tests unitarios para cada capa nueva.

### Out of scope (TODOs para multi-bot)

- Múltiples instancias simultáneas de bot.
- UI para editar host/port/username desde el cliente (se mantiene por env vars).
- Selector/menú de bots.
- Roles/permisos granulares por bot (por ahora: usuario autenticado puede todo).
- Dashboard por bot (stats, inventory, activity por instancia).

## Decisiones de diseño

1. **Kick manual = desconexión permanente.** La reconexión automática solo se dispara en fallos de red (not-manual). Si el usuario expulsa, el bot se queda fuera hasta que haga clic en "Agregar".
2. **Intención persistida en DB.** Un reinicio del servidor respeta el último estado: si el usuario había expulsado, el bot arranca fuera. Evita comportamiento sorpresivo tras reinicios.
3. **Config de conexión por env vars.** `MINECRAFT_HOST`, `MINECRAFT_PORT`, `BOT_USERNAME` siguen siendo la fuente de verdad. Editar la config requiere modificar `.env` y reiniciar.
4. **UI minimalista.** Un solo botón en el header que refleja estado y toglea. Sin panel de control dedicado.

## Arquitectura

Tres capas colaboran con responsabilidad única cada una:

```
┌──────────────────────────────────────────────────────────────┐
│  UI (Dashboard.tsx)                                          │
│    └── <BotControlButton status onConnect onDisconnect />    │
└────────────────┬─────────────────────────────────────────────┘
                 │ useSocket.connectBot() / disconnectBot()
                 │ emite 'bot:connect' / 'bot:disconnect'
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  socket/events.ts                                            │
│    delega a bot-control.ts                                   │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  bot/bot-control.ts (orquestación)                           │
│    1. actualiza DB (setDesiredState)                         │
│    2. llama bot runtime (connectBot / disconnectBot)         │
│    3. broadcast estado via io                                │
└────────┬───────────────────────────────────┬─────────────────┘
         ▼                                   ▼
┌─────────────────────────┐    ┌──────────────────────────────┐
│ db/bot-config.ts        │    │ bot/index.ts (runtime)       │
│  - getDesiredState()    │    │  - connectBot()              │
│  - setDesiredState()    │    │  - disconnectBot()           │
└─────────────────────────┘    │  - getBot()                  │
                               │  - internal: manualDisconnect│
                               │    flag suprime auto-reconnect│
                               └──────────────────────────────┘
```

### Aplicación de SOLID

- **SRP**: cada módulo tiene una razón de cambio. Persistencia, lifecycle de mineflayer, orquestación, transporte y render están separados.
- **OCP**: la tabla y las funciones se extienden con un parámetro `botId` en la iteración multi-bot sin reescribir la lógica existente.
- **ISP**: eventos de socket granulares (`bot:connect` en vez de un genérico con payload discriminado).
- **DIP**: `bot-control` depende de la API del runtime, no de mineflayer directamente → testeable con mocks.

## Componentes

### 1. DB schema

`apps/bot/src/db/schema.ts` — tabla nueva:

```ts
export const botConfig = sqliteTable('bot_config', {
  id: integer('id').primaryKey(),                  // singleton: siempre 1
  desiredState: text('desired_state').notNull(),   // 'connected' | 'disconnected'
  updatedAt: integer('updated_at').notNull(),
})
// TODO(multi-bot): pasará a filas por bot con name, host, port, username.
```

`apps/bot/src/db/bot-config.ts` — helpers:

```ts
export type DesiredState = 'connected' | 'disconnected'

export function getDesiredState(db): DesiredState   // default 'connected' si fila no existe
export function setDesiredState(db, state: DesiredState): void
```

La tabla se auto-crea en `db/index.ts` junto a las demás (`CREATE TABLE IF NOT EXISTS`).

### 2. Bot runtime — `apps/bot/src/bot/index.ts`

API pública:

```ts
export function getBot(): Bot | null
export function getBotConfig(): BotConfig | null
export function connectBot(config: BotConfig): Bot
export function disconnectBot(): void
```

Cambios:
- Módulo conserva `let bot: Bot | null` y gana `let manualDisconnect = false` y `let savedConfig: BotConfig | null`.
- `connectBot()`: resetea `manualDisconnect = false`, guarda config, crea mineflayer, ata listeners, devuelve bot.
- `disconnectBot()`: setea `manualDisconnect = true`, llama `bot.quit()`.
- `bot.on('end')`: reconecta **solo si** `!manualDisconnect && savedConfig !== null`. Usa `savedConfig` en vez de argumento implícito.
- Extrae helpers privados: `applyResistanceEffect(bot)`, `attachLifecycleLogs(bot)`. Reduce tamaño de `connectBot` (clean code: funciones pequeñas).

### 3. Orquestación — `apps/bot/src/bot/bot-control.ts` (nuevo)

```ts
export async function requestConnect(io: TypedIO, config: BotConfig): Promise<void>
export async function requestDisconnect(io: TypedIO): Promise<void>
```

Cada función:
1. Lee estado actual; si ya coincide, no-op + log.
2. `io.emit('bot:status', 'connecting')` (transición).
3. Actualiza DB.
4. Llama runtime (`connectBot` / `disconnectBot`).
5. Al completarse, emite `'connected'` o `'disconnected'`.

### 4. Startup — `apps/bot/src/server.ts`

```ts
server.listen(PORT, () => {
  console.log(`MineBot server running on port ${PORT}`)

  const config = readBotConfigFromEnv()
  const desired = getDesiredState(getDb())

  if (desired === 'connected') {
    connectBot(config)
    wireSpawnHandlers(...)
  } else {
    console.log('[Bot] desiredState=disconnected; waiting for user action')
    io.emit('bot:status', 'disconnected')
  }
})
```

Los handlers de `spawn` / `end` / `kicked` que hoy están inline se mueven a una función `wireSpawnHandlers(bot, io, startBotListeners, stopBotListeners)` para poder llamarlos también en reconexiones iniciadas desde el socket.

### 5. Socket events — tipos compartidos

```ts
// packages/shared/src/types.ts
export interface ClientToServerEvents {
  'voice:command': (command: VoiceCommand) => void
  'bot:connect': () => void        // TODO(multi-bot): recibirá botId
  'bot:disconnect': () => void     // TODO(multi-bot): recibirá botId
}
```

`apps/bot/src/socket/events.ts`:

```ts
socket.on('bot:connect', () => requestConnect(io, getBotConfigFromEnv()))
socket.on('bot:disconnect', () => requestDisconnect(io))
```

### 6. UI — `apps/web/src/components/BotControlButton.tsx` (nuevo)

Props:

```ts
interface Props {
  status: BotStatus
  onConnect: () => void
  onDisconnect: () => void
}
```

Estados visuales:

| `status`         | Label        | Color bg              | Disabled |
|------------------|--------------|------------------------|----------|
| `disconnected`   | `AGREGAR`    | `--mc-danger`          | no       |
| `connecting`     | `CONECTANDO` | `--mc-warning`         | sí       |
| `connected`      | `EXPULSAR`   | `--mc-success`         | no       |
| `dead`           | `EXPULSAR`   | `--mc-warning`         | no       |

Usa la clase `mc-btn` existente + modificadores para color. Click → `onConnect` si `disconnected`, `onDisconnect` si `connected|dead`, no-op si `connecting`.

### 7. Hook `useSocket.ts`

Se agregan dos funciones al return:

```ts
const connectBot = useCallback(() => socket.emit('bot:connect'), [socket])
const disconnectBot = useCallback(() => socket.emit('bot:disconnect'), [socket])
return { ..., connectBot, disconnectBot }
```

### 8. Dashboard.tsx

El indicador actual (`<span>` con puntito verde/rojo en líneas 88-95) se reemplaza con:

```tsx
<BotControlButton
  status={botStatus}
  onConnect={connectBot}
  onDisconnect={disconnectBot}
/>
```

## Flujos

### Flujo 1 — Arranque normal (usuario nunca expulsó)

1. Servidor arranca → lee `bot_config.desiredState` → no existe → default `'connected'`.
2. `connectBot(envConfig)` se llama como hoy.
3. Bot spawn → listeners activos → UI muestra "EXPULSAR".

### Flujo 2 — Usuario expulsa

1. Click en "EXPULSAR" → frontend emite `bot:disconnect`.
2. Backend: `requestDisconnect(io)`.
3. `setDesiredState(db, 'disconnected')`.
4. `disconnectBot()` → `manualDisconnect=true` → `bot.quit()`.
5. `bot.on('end')` se dispara → guard `if (manualDisconnect) return` → no reconecta.
6. `io.emit('bot:status', 'disconnected')` → UI muestra "AGREGAR".

### Flujo 3 — Usuario agrega

1. Click en "AGREGAR" → emite `bot:connect`.
2. `requestConnect(io, envConfig)`.
3. `setDesiredState(db, 'connected')`.
4. `io.emit('bot:status', 'connecting')`.
5. `connectBot(envConfig)` → crea nueva instancia mineflayer → `manualDisconnect=false`.
6. `spawn` → listeners activos → `io.emit('bot:status', 'connected')`.

### Flujo 4 — Reinicio con expulsión previa

1. Usuario expulsó hace 2 horas → DB tiene `desiredState='disconnected'`.
2. Reiniciamos server.
3. Startup lee `desiredState='disconnected'` → no llama `connectBot`.
4. `io.emit('bot:status', 'disconnected')` al conectarse clientes → UI muestra "AGREGAR".

### Flujo 5 — Desconexión por fallo de red (no manual)

1. Bot pierde conexión con Minecraft → `bot.on('end')`.
2. `manualDisconnect === false` → reconnect en 5s con `savedConfig`.
3. Comportamiento actual intacto.

## Tests

Siguiendo F.I.R.S.T. del skill clean-code:

### Unitarios backend

1. `db/bot-config.test.ts`
   - `getDesiredState` devuelve `'connected'` por defecto cuando tabla vacía.
   - `setDesiredState` persiste y es legible con `getDesiredState`.
   - `updatedAt` se actualiza en cada escritura.

2. `bot/bot-control.test.ts` (mockea mineflayer)
   - `connectBot` crea instancia y resetea `manualDisconnect`.
   - `disconnectBot` llama `bot.quit()` y setea `manualDisconnect`.
   - Evento `end` con `manualDisconnect=true` NO reconecta.
   - Evento `end` con `manualDisconnect=false` sí reconecta tras 5s (usa fake timers).

3. `socket/bot-control.test.ts`
   - Evento `bot:disconnect` llama `setDesiredState(db, 'disconnected')` y `disconnectBot()`.
   - Evento `bot:connect` llama `setDesiredState(db, 'connected')` y `connectBot(...)`.
   - Request redundante (ya en el estado pedido) es no-op.

### Unitarios frontend

4. `BotControlButton.test.tsx`
   - Render con status `'connected'` muestra "EXPULSAR" y click dispara `onDisconnect`.
   - Render con status `'disconnected'` muestra "AGREGAR" y click dispara `onConnect`.
   - Render con status `'connecting'` está disabled.

## TODOs explícitos para multi-bot

Marcadores `// TODO(multi-bot):` en:

- `db/schema.ts` — tabla singleton → fila por bot; añadir `name`, `host`, `port`, `username`.
- `db/bot-config.ts` — funciones sin `botId` → con `botId`.
- `bot/index.ts` — singleton `bot`, `manualDisconnect`, `savedConfig` → mapa por `botId`.
- `bot/bot-control.ts` — `requestConnect/requestDisconnect` sin `botId` → con.
- `socket/events.ts` — eventos sin `botId` → con.
- `server.ts` — startup itera bots en lugar de uno solo.
- `types.ts` — eventos reciben `botId`.
- `Dashboard.tsx` — botón único → selector de bots + panel por bot.

Plus: se creará un doc `docs/superpowers/plans/2026-04-14-multi-bot-roadmap.md` con el plan de upgrade en una iteración futura (fuera de scope).

## Criterios de éxito

- [ ] Usuario puede expulsar el bot desde la UI y se queda fuera tras reinicios.
- [ ] Usuario puede agregar el bot de vuelta desde la UI.
- [ ] Fallos de red siguen disparando reconexión automática.
- [ ] Todos los tests nuevos pasan.
- [ ] No hay regresiones en los tests existentes.
- [ ] El código tiene marcadores `TODO(multi-bot):` en los puntos de extensión.
