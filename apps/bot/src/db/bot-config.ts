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
