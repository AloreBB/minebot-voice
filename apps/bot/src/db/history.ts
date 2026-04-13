import { desc } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { BotAction } from '@minebot/shared'
import { conversations } from './schema.js'
import type * as schema from './schema.js'

type Db = BetterSQLite3Database<typeof schema>

export interface ConversationInput {
  player: string
  command: string
  understood: string
  actions: BotAction[]
}

export interface ConversationRow {
  id: number
  player: string
  command: string
  understood: string
  actions: string
  createdAt: Date
}

export function saveConversation(db: Db, input: ConversationInput): void {
  db.insert(conversations)
    .values({
      player: input.player,
      command: input.command,
      understood: input.understood,
      actions: JSON.stringify(input.actions),
    })
    .run()
}

export function getRecentHistory(db: Db, limit: number = 10): ConversationRow[] {
  return db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt), desc(conversations.id))
    .limit(limit)
    .all()
}

export function formatHistoryForPrompt(rows: ConversationRow[]): string {
  if (rows.length === 0) return ''

  // Reverse so oldest is first (chronological order)
  const chronological = [...rows].reverse()

  return chronological
    .map((row) => `${row.player}: ${row.command}\nBot: ${row.understood}`)
    .join('\n')
}
