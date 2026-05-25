import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema.js'
import {
  getAllProviders, insertProvider, activateProvider,
  deleteProvider, updateProvider, getActiveProviderConfig, touchLastUsed,
} from '../db/ai-providers.js'

beforeEach(() => {
  vi.stubEnv('ENCRYPTION_MASTER_KEY', 'a'.repeat(64))
})

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.prepare(`
    CREATE TABLE ai_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      masked_key TEXT NOT NULL,
      base_url TEXT,
      model TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    )
  `).run()
  return drizzle(sqlite, { schema })
}

describe('ai-providers DB layer', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => { db = createTestDb() })

  it('insertProvider stores masked key, not plaintext', () => {
    const row = insertProvider(db, {
      providerType: 'anthropic',
      displayName: 'Test Claude',
      apiKey: 'sk-ant-api03-AbcXyz1234',
      model: 'claude-sonnet-4-6',
    })
    expect(row.maskedKey).toBe('sk-...1234')
    expect(row.maskedKey).not.toContain('AbcXyz')
    expect(row.isActive).toBe(false)
  })

  it('getAllProviders returns rows without encryptedKey field', () => {
    insertProvider(db, { providerType: 'openai', displayName: 'GPT', apiKey: 'sk-oai-12345678', model: 'gpt-4o' })
    const rows = getAllProviders(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('encryptedKey')
    expect(rows[0]).not.toHaveProperty('encrypted_key')
  })

  it('activateProvider sets isActive=true for target and false for all others', () => {
    const a = insertProvider(db, { providerType: 'anthropic', displayName: 'A', apiKey: 'sk-ant-12345678', model: 'claude-sonnet-4-6' })
    const b = insertProvider(db, { providerType: 'openai', displayName: 'B', apiKey: 'sk-oai-12345678', model: 'gpt-4o' })
    activateProvider(db, a.id)
    activateProvider(db, b.id)
    const rows = getAllProviders(db)
    expect(rows.find(r => r.id === a.id)!.isActive).toBe(false)
    expect(rows.find(r => r.id === b.id)!.isActive).toBe(true)
  })

  it('activateProvider returns false for non-existent id', () => {
    expect(activateProvider(db, 999)).toBe(false)
  })

  it('getActiveProviderConfig returns null when no provider is active', () => {
    insertProvider(db, { providerType: 'anthropic', displayName: 'A', apiKey: 'sk-ant-12345678', model: 'claude-sonnet-4-6' })
    expect(getActiveProviderConfig(db)).toBeNull()
  })

  it('getActiveProviderConfig resolves null baseUrl to predefined URL', () => {
    const row = insertProvider(db, { providerType: 'anthropic', displayName: 'A', apiKey: 'sk-ant-12345678', model: 'claude-sonnet-4-6' })
    activateProvider(db, row.id)
    expect(getActiveProviderConfig(db)?.baseUrl).toBe('https://api.anthropic.com')
  })

  it('getActiveProviderConfig decrypts API key correctly', () => {
    const row = insertProvider(db, { providerType: 'anthropic', displayName: 'A', apiKey: 'sk-ant-api03-real-key-here', model: 'claude-sonnet-4-6' })
    activateProvider(db, row.id)
    expect(getActiveProviderConfig(db)?.apiKey).toBe('sk-ant-api03-real-key-here')
  })

  it('getActiveProviderConfig uses custom baseUrl when provided', () => {
    const row = insertProvider(db, {
      providerType: 'custom', displayName: 'Local', apiKey: 'local-key-12345',
      model: 'mistral', baseUrl: 'http://localhost:11434/v1',
    })
    activateProvider(db, row.id)
    expect(getActiveProviderConfig(db)?.baseUrl).toBe('http://localhost:11434/v1')
  })

  it('deleteProvider removes the row and returns true', () => {
    const row = insertProvider(db, { providerType: 'openai', displayName: 'A', apiKey: 'sk-oai-12345678', model: 'gpt-4o' })
    expect(deleteProvider(db, row.id)).toBe(true)
    expect(getAllProviders(db)).toHaveLength(0)
  })

  it('deleteProvider returns false for non-existent id', () => {
    expect(deleteProvider(db, 999)).toBe(false)
  })

  it('deleting active provider causes getActiveProviderConfig to return null', () => {
    const row = insertProvider(db, { providerType: 'openai', displayName: 'A', apiKey: 'sk-oai-12345678', model: 'gpt-4o' })
    activateProvider(db, row.id)
    deleteProvider(db, row.id)
    expect(getActiveProviderConfig(db)).toBeNull()
  })

  it('updateProvider updates displayName and model without changing the key', () => {
    const row = insertProvider(db, { providerType: 'openai', displayName: 'Old', apiKey: 'sk-oai-12345678', model: 'gpt-4o' })
    activateProvider(db, row.id)
    updateProvider(db, row.id, { displayName: 'New', model: 'gpt-4.1' })
    const config = getActiveProviderConfig(db)
    expect(config?.displayName).toBe('New')
    expect(config?.model).toBe('gpt-4.1')
    expect(config?.apiKey).toBe('sk-oai-12345678')
  })

  it('touchLastUsed updates the lastUsedAt timestamp', async () => {
    const row = insertProvider(db, { providerType: 'openai', displayName: 'A', apiKey: 'sk-oai-12345678', model: 'gpt-4o' })
    const before = Date.now()
    await new Promise(r => setTimeout(r, 5))
    touchLastUsed(db, row.id)
    const updated = getAllProviders(db).find(r => r.id === row.id)!
    expect(updated.lastUsedAt).toBeGreaterThan(before)
  })
})