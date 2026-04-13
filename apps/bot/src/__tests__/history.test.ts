import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema.js'
import { saveConversation, getRecentHistory, formatHistoryForPrompt } from '../db/history.js'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player TEXT NOT NULL,
      command TEXT NOT NULL,
      understood TEXT NOT NULL,
      actions TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)
  return drizzle(sqlite, { schema })
}

describe('history', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  describe('saveConversation', () => {
    it('inserts a conversation record', () => {
      saveConversation(db, {
        player: 'Steve',
        command: 'mina diamantes',
        understood: 'Voy a minar diamantes',
        actions: [{ action: 'mine', block: 'diamond_ore', count: 5 }],
      })

      const rows = db.select().from(schema.conversations).all()
      expect(rows).toHaveLength(1)
      expect(rows[0].player).toBe('Steve')
      expect(rows[0].command).toBe('mina diamantes')
    })
  })

  describe('getRecentHistory', () => {
    it('returns the last N conversations ordered newest first', () => {
      saveConversation(db, {
        player: 'Steve',
        command: 'mina piedra',
        understood: 'Minando piedra',
        actions: [{ action: 'mine', block: 'stone', count: 10 }],
      })
      saveConversation(db, {
        player: 'Steve',
        command: 'ven aqui',
        understood: 'Siguiendo a Steve',
        actions: [{ action: 'follow', player: 'Steve' }],
      })
      saveConversation(db, {
        player: 'Steve',
        command: 'crafteame un hacha',
        understood: 'Crafteando hacha',
        actions: [{ action: 'craft', item: 'stone_axe' }],
      })

      const recent = getRecentHistory(db, 2)
      expect(recent).toHaveLength(2)
      expect(recent[0].command).toBe('crafteame un hacha')
      expect(recent[1].command).toBe('ven aqui')
    })

    it('returns empty array when no history exists', () => {
      const recent = getRecentHistory(db, 10)
      expect(recent).toHaveLength(0)
    })
  })

  describe('formatHistoryForPrompt', () => {
    it('formats history entries as readable text', () => {
      saveConversation(db, {
        player: 'Steve',
        command: 'mina diamantes',
        understood: 'Voy a minar diamantes',
        actions: [{ action: 'mine', block: 'diamond_ore', count: 5 }],
      })

      const recent = getRecentHistory(db, 5)
      const formatted = formatHistoryForPrompt(recent)
      expect(formatted).toContain('Steve: mina diamantes')
      expect(formatted).toContain('Bot: Voy a minar diamantes')
    })

    it('returns empty string for empty history', () => {
      const formatted = formatHistoryForPrompt([])
      expect(formatted).toBe('')
    })
  })
})
