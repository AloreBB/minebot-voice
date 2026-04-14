import type { Server } from 'socket.io'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { ServerToClientEvents, ClientToServerEvents } from '@minebot/shared'
import * as schema from '../db/schema.js'
import { getDesiredState, setDesiredState } from '../db/bot-config.js'
import { connectBot, disconnectBot, getBot, type BotConfig } from './index.js'

type TypedIO = Server<ClientToServerEvents, ServerToClientEvents>
type Db = BetterSQLite3Database<typeof schema>
type LifecycleWirer = (bot: ReturnType<typeof connectBot>) => void

// TODO(multi-bot): estas funciones recibirán `botId: string` además de db/io/config.

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
