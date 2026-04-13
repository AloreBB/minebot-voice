import { desc, lt } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { activityEvents } from './schema.js'
import type * as schema from './schema.js'

type Db = BetterSQLite3Database<typeof schema>

export interface ActivityInput {
  type: string
  message: string
  timestamp: number
}

export interface ActivityRow {
  id: number
  type: string
  message: string
  timestamp: number
}

export function saveActivity(db: Db, input: ActivityInput): void {
  db.insert(activityEvents)
    .values({
      type: input.type,
      message: input.message,
      timestamp: input.timestamp,
    })
    .run()
}

export function getRecentActivity(db: Db, limit: number = 50): ActivityRow[] {
  return db
    .select()
    .from(activityEvents)
    .orderBy(desc(activityEvents.id))
    .limit(limit)
    .all()
}

export function getActivityBefore(db: Db, beforeId: number, limit: number = 50): ActivityRow[] {
  return db
    .select()
    .from(activityEvents)
    .where(lt(activityEvents.id, beforeId))
    .orderBy(desc(activityEvents.id))
    .limit(limit)
    .all()
}
