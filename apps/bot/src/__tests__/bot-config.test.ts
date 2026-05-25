import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema.js'
import { getDesiredState, setDesiredState, getServerConfig, setServerConfig } from '../db/bot-config.js'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.prepare(`
    CREATE TABLE bot_config (
      id INTEGER PRIMARY KEY,
      desired_state TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      host TEXT,
      port INTEGER,
      username TEXT,
      version TEXT
    )
  `).run()
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

  describe('getServerConfig', () => {
    it('returns null when table is empty', () => {
      expect(getServerConfig(db)).toBeNull()
    })

    it('returns null when row exists but host is null', () => {
      setDesiredState(db, 'connected')
      expect(getServerConfig(db)).toBeNull()
    })

    it('returns config after setServerConfig', () => {
      setServerConfig(db, { host: 'mc.example.com', port: 25565, username: 'Bot' })
      expect(getServerConfig(db)).toEqual({
        host: 'mc.example.com',
        port: 25565,
        username: 'Bot',
        version: undefined,
      })
    })

    it('includes version when set', () => {
      setServerConfig(db, { host: 'mc.example.com', port: 25565, username: 'Bot', version: '1.20.4' })
      expect(getServerConfig(db)).toEqual({
        host: 'mc.example.com',
        port: 25565,
        username: 'Bot',
        version: '1.20.4',
      })
    })
  })

  describe('setServerConfig', () => {
    it('does not overwrite desiredState on update', () => {
      setDesiredState(db, 'disconnected')
      setServerConfig(db, { host: 'a.com', port: 1234, username: 'X' })
      expect(getDesiredState(db)).toBe('disconnected')
    })

    it('overwrites previous server config', () => {
      setServerConfig(db, { host: 'a.com', port: 1, username: 'A' })
      setServerConfig(db, { host: 'b.com', port: 2, username: 'B' })
      expect(getServerConfig(db)).toMatchObject({ host: 'b.com', port: 2, username: 'B' })
    })
  })
})
