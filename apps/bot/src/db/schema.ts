import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  player: text('player').notNull(),
  command: text('command').notNull(),
  understood: text('understood').notNull(),
  actions: text('actions').notNull(), // JSON stringified BotAction[]
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const activityEvents = sqliteTable('activity_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // 'danger' | 'command' | 'action' | 'info'
  message: text('message').notNull(),
  timestamp: integer('timestamp').notNull(), // Unix ms
})

// TODO(multi-bot): cuando soportemos varios bots, esta tabla pasa a tener
// múltiples filas con columnas: name, host, port, username.
export const botConfig = sqliteTable('bot_config', {
  id: integer('id').primaryKey(),                  // singleton: siempre 1
  desiredState: text('desired_state').notNull(),   // 'connected' | 'disconnected'
  updatedAt: integer('updated_at').notNull(),      // unix ms
})
