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
