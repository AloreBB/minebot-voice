import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { aiProviders } from './schema.js'
import type * as schema from './schema.js'
import type { AIProviderType, AIProvider } from '@minebot/shared'
import { encryptApiKey, decryptApiKey, maskApiKey } from '../crypto.js'

type Db = BetterSQLite3Database<typeof schema>

export interface ActiveProviderConfig {
  id: number
  providerType: AIProviderType
  apiKey: string
  baseUrl: string
  model: string
  displayName: string
}

export const PREDEFINED_BASE_URLS: Record<AIProviderType, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  minimax: 'https://api.minimax.io/v1',
  glm: 'https://api.z.ai/api/paas/v4/',
  groq: 'https://api.groq.com/openai/v1',
  custom: '',
}

const PUBLIC_COLUMNS = {
  id: aiProviders.id,
  providerType: aiProviders.providerType,
  displayName: aiProviders.displayName,
  maskedKey: aiProviders.maskedKey,
  baseUrl: aiProviders.baseUrl,
  model: aiProviders.model,
  isActive: aiProviders.isActive,
  createdAt: aiProviders.createdAt,
  lastUsedAt: aiProviders.lastUsedAt,
} as const

export function getAllProviders(db: Db): AIProvider[] {
  return db.select(PUBLIC_COLUMNS).from(aiProviders).all() as AIProvider[]
}

export interface InsertProviderInput {
  providerType: AIProviderType
  displayName: string
  apiKey: string
  baseUrl?: string | null
  model: string
}

export function insertProvider(db: Db, input: InsertProviderInput): AIProvider {
  const now = Date.now()
  db.insert(aiProviders).values({
    providerType: input.providerType,
    displayName: input.displayName,
    encryptedKey: JSON.stringify(encryptApiKey(input.apiKey)),
    maskedKey: maskApiKey(input.apiKey),
    baseUrl: input.baseUrl ?? null,
    model: input.model,
    isActive: false,
    createdAt: now,
  }).run()
  return db.select(PUBLIC_COLUMNS).from(aiProviders)
    .orderBy(aiProviders.id)
    .all()
    .at(-1)! as AIProvider
}

export interface UpdateProviderInput {
  displayName?: string
  model?: string
  baseUrl?: string | null
  apiKey?: string
}

export function updateProvider(db: Db, id: number, input: UpdateProviderInput): AIProvider | null {
  if (input.displayName !== undefined)
    db.update(aiProviders).set({ displayName: input.displayName }).where(eq(aiProviders.id, id)).run()
  if (input.model !== undefined)
    db.update(aiProviders).set({ model: input.model }).where(eq(aiProviders.id, id)).run()
  if (input.baseUrl !== undefined)
    db.update(aiProviders).set({ baseUrl: input.baseUrl ?? null }).where(eq(aiProviders.id, id)).run()
  if (input.apiKey !== undefined) {
    db.update(aiProviders).set({
      encryptedKey: JSON.stringify(encryptApiKey(input.apiKey)),
      maskedKey: maskApiKey(input.apiKey),
    }).where(eq(aiProviders.id, id)).run()
  }
  return db.select(PUBLIC_COLUMNS).from(aiProviders)
    .where(eq(aiProviders.id, id)).get() as AIProvider | null
}

export function activateProvider(db: Db, id: number): boolean {
  const exists = db.select({ id: aiProviders.id }).from(aiProviders)
    .where(eq(aiProviders.id, id)).get()
  if (!exists) return false
  db.transaction((tx) => {
    tx.update(aiProviders).set({ isActive: false }).run()
    tx.update(aiProviders).set({ isActive: true }).where(eq(aiProviders.id, id)).run()
  })
  return true
}

export function deleteProvider(db: Db, id: number): boolean {
  const exists = db.select({ id: aiProviders.id }).from(aiProviders)
    .where(eq(aiProviders.id, id)).get()
  if (!exists) return false
  db.delete(aiProviders).where(eq(aiProviders.id, id)).run()
  return true
}

export function getActiveProviderConfig(db: Db): ActiveProviderConfig | null {
  const row = db.select().from(aiProviders)
    .where(eq(aiProviders.isActive, true)).get()
  if (!row) return null
  let apiKey: string
  try {
    apiKey = decryptApiKey(JSON.parse(row.encryptedKey))
  } catch {
    console.error('[DB] Failed to decrypt API key for provider id', row.id)
    return null
  }
  const providerType = row.providerType as AIProviderType
  return {
    id: row.id,
    providerType,
    apiKey,
    baseUrl: row.baseUrl ?? PREDEFINED_BASE_URLS[providerType],
    model: row.model,
    displayName: row.displayName,
  }
}

export function touchLastUsed(db: Db, id: number): void {
  db.update(aiProviders).set({ lastUsedAt: Date.now() })
    .where(eq(aiProviders.id, id)).run()
}