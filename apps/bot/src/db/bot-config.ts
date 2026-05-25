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
  const { desiredState } = row
  if (desiredState === 'connected' || desiredState === 'disconnected') return desiredState
  console.warn(`[bot-config] Unexpected desiredState value: "${desiredState}", defaulting to "connected"`)
  return 'connected'
}

export function setDesiredState(db: Db, state: DesiredState): void {
  const now = Date.now()
  db.insert(botConfig)
    .values({ id: SINGLETON_ID, desiredState: state, updatedAt: now })
    .onConflictDoUpdate({ target: botConfig.id, set: { desiredState: state, updatedAt: now } })
    .run()
}
