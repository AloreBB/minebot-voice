import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema.js'
import { saveActivity, getRecentActivity, getActivityBefore } from '../db/activity.js'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE activity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `)
  return drizzle(sqlite, { schema })
}

describe('activity', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  describe('saveActivity', () => {
    it('inserts an activity event', () => {
      saveActivity(db, { type: 'info', message: 'Bot spawned', timestamp: 1000 })
      const rows = db.select().from(schema.activityEvents).all()
      expect(rows).toHaveLength(1)
      expect(rows[0].message).toBe('Bot spawned')
      expect(rows[0].type).toBe('info')
    })
  })

  describe('getRecentActivity', () => {
    it('returns the last N events newest first', () => {
      saveActivity(db, { type: 'info', message: 'Event 1', timestamp: 1000 })
      saveActivity(db, { type: 'action', message: 'Event 2', timestamp: 2000 })
      saveActivity(db, { type: 'danger', message: 'Event 3', timestamp: 3000 })

      const events = getRecentActivity(db, 2)
      expect(events).toHaveLength(2)
      expect(events[0].message).toBe('Event 3')
      expect(events[1].message).toBe('Event 2')
    })

    it('returns empty array when no events exist', () => {
      expect(getRecentActivity(db, 50)).toHaveLength(0)
    })
  })

  describe('getActivityBefore', () => {
    it('returns events older than the given ID with limit', () => {
      saveActivity(db, { type: 'info', message: 'Event 1', timestamp: 1000 })
      saveActivity(db, { type: 'info', message: 'Event 2', timestamp: 2000 })
      saveActivity(db, { type: 'info', message: 'Event 3', timestamp: 3000 })
      saveActivity(db, { type: 'info', message: 'Event 4', timestamp: 4000 })

      // Get events before id=4 (Event 4), limit 2
      const events = getActivityBefore(db, 4, 2)
      expect(events).toHaveLength(2)
      expect(events[0].message).toBe('Event 3')
      expect(events[1].message).toBe('Event 2')
    })

    it('returns empty when no events before cursor', () => {
      saveActivity(db, { type: 'info', message: 'Event 1', timestamp: 1000 })
      const events = getActivityBefore(db, 1, 10)
      expect(events).toHaveLength(0)
    })
  })
})
