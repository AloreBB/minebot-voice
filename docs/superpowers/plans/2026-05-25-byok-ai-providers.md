# BYOK — AI Provider Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the dashboard owner to store multiple AI provider API keys (Anthropic, OpenAI, DeepSeek, MiniMax, GLM, Groq, or any OpenAI-compatible endpoint) in SQLite encrypted with AES-256-GCM, select which one is active, and have the bot use it at runtime instead of env vars.

**Architecture:** New `ai_providers` table in SQLite stores one row per configured provider; API keys are encrypted with AES-256-GCM using a key derived via HKDF from a new `ENCRYPTION_MASTER_KEY` env var. The command parser drops module-level env-var singletons and receives a resolved `ActiveProviderConfig` per call from `socket/events.ts`.

**Tech Stack:** Node.js `node:crypto` (AES-256-GCM + HKDF), Drizzle ORM + better-sqlite3, Express Router, React 19 + Vite, `@anthropic-ai/sdk`, `openai` npm package, vitest.

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/bot/src/crypto.ts` |
| Create | `apps/bot/src/db/ai-providers.ts` |
| Create | `apps/bot/src/routes/ai-providers.ts` |
| Create | `apps/bot/src/__tests__/crypto.test.ts` |
| Create | `apps/bot/src/__tests__/ai-providers.test.ts` |
| Create | `apps/bot/src/__tests__/ai-provider-routes.test.ts` |
| Create | `apps/web/src/hooks/useAIProviders.ts` |
| Create | `apps/web/src/components/AIProviderPanel.tsx` |
| Modify | `apps/bot/src/db/schema.ts` |
| Modify | `apps/bot/src/db/index.ts` |
| Modify | `apps/bot/src/ai/command-parser.ts` |
| Modify | `apps/bot/src/socket/events.ts` |
| Modify | `apps/bot/src/server.ts` |
| Modify | `packages/shared/src/types.ts` |
| Modify | `apps/web/src/components/Dashboard.tsx` |

---

## Task 1: DB Schema — add `ai_providers` table

**Files:**
- Modify: `apps/bot/src/db/schema.ts`
- Modify: `apps/bot/src/db/index.ts`

- [ ] **Step 1: Add table definition to schema.ts**

Append after the `botConfig` export in `apps/bot/src/db/schema.ts`:

```typescript
export const aiProviders = sqliteTable('ai_providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  providerType: text('provider_type').notNull(),
  // 'anthropic' | 'openai' | 'deepseek' | 'minimax' | 'glm' | 'groq' | 'custom'
  displayName: text('display_name').notNull(),
  encryptedKey: text('encrypted_key').notNull(), // JSON: {v,iv,tag,ct}
  maskedKey: text('masked_key').notNull(),
  baseUrl: text('base_url'),                      // null = use predefined URL
  model: text('model').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  lastUsedAt: integer('last_used_at'),
})
```

- [ ] **Step 2: Add CREATE TABLE to db/index.ts**

Inside `getDb()`, after the `bot_config` table creation block, add a new `sqlite.prepare(...).run()` call:

```typescript
  sqlite.prepare(`
    CREATE TABLE IF NOT EXISTS ai_providers (
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
```

Note: the existing tables use `sqlite.exec(...)` — either form works. Use `.prepare(...).run()` to avoid ambiguity with Node's `child_process` API.

- [ ] **Step 3: Generate Drizzle migration snapshot**

```bash
cd apps/bot && yarn drizzle-kit generate
```

Expected: new file `drizzle/0001_*.sql` containing the `ai_providers` CREATE TABLE statement.

- [ ] **Step 4: Commit**

```bash
git add apps/bot/src/db/schema.ts apps/bot/src/db/index.ts apps/bot/drizzle/
git commit -m "feat(db): add ai_providers table schema"
```

---

## Task 2: Crypto Service

**Files:**
- Create: `apps/bot/src/crypto.ts`
- Create: `apps/bot/src/__tests__/crypto.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/bot/src/__tests__/crypto.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { encryptApiKey, decryptApiKey, maskApiKey } from '../crypto.js'

describe('crypto', () => {
  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', 'a'.repeat(64))
  })

  describe('encryptApiKey / decryptApiKey', () => {
    it('round-trips to the original plaintext', () => {
      const key = 'sk-ant-api03-AbcXyz1234'
      expect(decryptApiKey(encryptApiKey(key))).toBe(key)
    })

    it('produces different IVs on each call for the same input', () => {
      const a = encryptApiKey('same-key')
      const b = encryptApiKey('same-key')
      expect(a.iv).not.toBe(b.iv)
    })

    it('throws when ciphertext is corrupted (GCM auth tag mismatch)', () => {
      const payload = encryptApiKey('test-value')
      payload.ct = 'deadbeef00112233'
      expect(() => decryptApiKey(payload)).toThrow()
    })

    it('throws when ENCRYPTION_MASTER_KEY is not set', () => {
      vi.unstubAllEnvs()
      expect(() => encryptApiKey('x')).toThrow('ENCRYPTION_MASTER_KEY')
    })
  })

  describe('maskApiKey', () => {
    it('shows first 3 and last 4 chars for long keys', () => {
      expect(maskApiKey('sk-ant-api03-AbcXyz')).toBe('sk-...cXyz')
    })

    it('returns **** for keys 8 chars or shorter', () => {
      expect(maskApiKey('shortkey')).toBe('****')
      expect(maskApiKey('short')).toBe('****')
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/bot && yarn test src/__tests__/crypto.test.ts
```

Expected: `Cannot find module '../crypto.js'`

- [ ] **Step 3: Implement the crypto service**

```typescript
// apps/bot/src/crypto.ts
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export interface EncryptedPayload {
  v: number   // key version — always 1; enables rotation later
  iv: string  // hex, 12 bytes
  tag: string // hex, 16 bytes (GCM auth tag)
  ct: string  // hex ciphertext
}

const KEY_PURPOSE = 'minebot:user-api-keys-v1'

function deriveKey(): Buffer {
  const masterHex = process.env.ENCRYPTION_MASTER_KEY
  if (!masterHex) throw new Error('ENCRYPTION_MASTER_KEY is not set')
  const master = Buffer.from(masterHex, 'hex')
  return Buffer.from(hkdfSync('sha256', master, '', KEY_PURPOSE, 32))
}

export function encryptApiKey(plaintext: string): EncryptedPayload {
  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    v: 1,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ct: ct.toString('hex'),
  }
}

export function decryptApiKey(payload: EncryptedPayload): string {
  const key = deriveKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ct, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****'
  return `${key.slice(0, 3)}...${key.slice(-4)}`
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/bot && yarn test src/__tests__/crypto.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/crypto.ts apps/bot/src/__tests__/crypto.test.ts
git commit -m "feat(crypto): add AES-256-GCM encrypt/decrypt for API keys"
```

---

## Task 3: Shared Types

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add AIProviderType and AIProvider**

Append after `ServerConfig` in `packages/shared/src/types.ts`:

```typescript
export type AIProviderType =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'minimax'
  | 'glm'
  | 'groq'
  | 'custom'

export interface AIProvider {
  id: number
  providerType: AIProviderType
  displayName: string
  maskedKey: string
  baseUrl: string | null
  model: string
  isActive: boolean
  createdAt: number
  lastUsedAt: number | null
}
```

- [ ] **Step 2: Type-check**

```bash
cd packages/shared && yarn tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add AIProviderType and AIProvider types"
```

---

## Task 4: DB Access Layer

**Files:**
- Create: `apps/bot/src/db/ai-providers.ts`
- Create: `apps/bot/src/__tests__/ai-providers.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/bot/src/__tests__/ai-providers.test.ts
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/bot && yarn test src/__tests__/ai-providers.test.ts
```

Expected: `Cannot find module '../db/ai-providers.js'`

- [ ] **Step 3: Implement the DB access layer**

```typescript
// apps/bot/src/db/ai-providers.ts
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
  apiKey: string      // plaintext — decrypted in memory, never log this
  baseUrl: string     // always resolved (predefined or user-provided)
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
  // Return the newly inserted row without the encryptedKey
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/bot && yarn test src/__tests__/ai-providers.test.ts
```

Expected: all 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/db/ai-providers.ts apps/bot/src/__tests__/ai-providers.test.ts
git commit -m "feat(db): add ai-providers access layer with encrypt/decrypt"
```

---

## Task 5: Route Validation & Provider API Check

**Files:**
- Create: `apps/bot/src/routes/ai-providers.ts` (validation + fetch helpers only; router stub for now)
- Create: `apps/bot/src/__tests__/ai-provider-routes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/bot/src/__tests__/ai-provider-routes.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { validateAIProviderBody, validateApiKeyWithProvider } from '../routes/ai-providers.js'

afterEach(() => vi.restoreAllMocks())

describe('validateAIProviderBody', () => {
  it('accepts a valid anthropic body', () => {
    const r = validateAIProviderBody({ providerType: 'anthropic', displayName: 'My Claude', apiKey: 'sk-ant-abc123', model: 'claude-sonnet-4-6' })
    expect(r.valid).toBe(true)
    if (r.valid) expect(r.providerType).toBe('anthropic')
  })

  it('rejects unknown providerType', () => {
    const r = validateAIProviderBody({ providerType: 'unknown', displayName: 'X', apiKey: 'sk-x', model: 'x' })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toHaveProperty('providerType')
  })

  it('rejects empty displayName', () => {
    const r = validateAIProviderBody({ providerType: 'openai', displayName: '', apiKey: 'sk-x', model: 'gpt-4o' })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toHaveProperty('displayName')
  })

  it('rejects missing apiKey', () => {
    const r = validateAIProviderBody({ providerType: 'openai', displayName: 'GPT', model: 'gpt-4o' })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toHaveProperty('apiKey')
  })

  it('rejects empty model', () => {
    const r = validateAIProviderBody({ providerType: 'openai', displayName: 'GPT', apiKey: 'sk-x', model: '' })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toHaveProperty('model')
  })

  it('requires baseUrl for custom providerType', () => {
    const r = validateAIProviderBody({ providerType: 'custom', displayName: 'X', apiKey: 'sk-x', model: 'y' })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toHaveProperty('baseUrl')
  })

  it('accepts custom providerType when baseUrl is provided', () => {
    const r = validateAIProviderBody({ providerType: 'custom', displayName: 'Local', apiKey: 'key', model: 'mistral', baseUrl: 'http://localhost:11434/v1' })
    expect(r.valid).toBe(true)
  })
})

describe('validateApiKeyWithProvider', () => {
  it('returns "valid" when provider responds 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]', { status: 200 }))
    expect(await validateApiKeyWithProvider('openai', 'sk-test')).toBe('valid')
  })

  it('returns "invalid" when provider responds 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 401 }))
    expect(await validateApiKeyWithProvider('openai', 'sk-bad')).toBe('invalid')
  })

  it('returns "invalid" when provider responds 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 403 }))
    expect(await validateApiKeyWithProvider('deepseek', 'sk-bad')).toBe('invalid')
  })

  it('returns "timeout" on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network failure'))
    expect(await validateApiKeyWithProvider('anthropic', 'sk-ant-key')).toBe('timeout')
  })

  it('uses x-api-key header for anthropic', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]', { status: 200 }))
    await validateApiKeyWithProvider('anthropic', 'my-ant-key')
    const [url, init] = spy.mock.calls[0]
    expect(String(url)).toContain('api.anthropic.com')
    expect((init?.headers as Record<string, string>)['x-api-key']).toBe('my-ant-key')
  })

  it('uses Authorization Bearer for openai-compatible providers', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]', { status: 200 }))
    await validateApiKeyWithProvider('deepseek', 'ds-key')
    const [, init] = spy.mock.calls[0]
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer ds-key')
  })

  it('uses custom baseUrl when provided', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]', { status: 200 }))
    await validateApiKeyWithProvider('custom', 'key', 'http://localhost:11434/v1')
    expect(String(spy.mock.calls[0][0])).toContain('localhost:11434')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/bot && yarn test src/__tests__/ai-provider-routes.test.ts
```

Expected: `Cannot find module '../routes/ai-providers.js'`

- [ ] **Step 3: Implement validation helpers + router stub**

```typescript
// apps/bot/src/routes/ai-providers.ts
import { Router } from 'express'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../db/schema.js'
import type { AIProviderType } from '@minebot/shared'
import { getAllProviders, insertProvider, updateProvider, activateProvider, deleteProvider, PREDEFINED_BASE_URLS } from '../db/ai-providers.js'

type Db = BetterSQLite3Database<typeof schema>

const VALID_PROVIDER_TYPES: AIProviderType[] = ['anthropic', 'openai', 'deepseek', 'minimax', 'glm', 'groq', 'custom']

interface ValidBody {
  valid: true; providerType: AIProviderType; displayName: string
  apiKey: string; model: string; baseUrl?: string; skipValidation: boolean
}
interface InvalidBody { valid: false; errors: Record<string, string> }

export function validateAIProviderBody(body: unknown): ValidBody | InvalidBody {
  const errors: Record<string, string> = {}
  const b = body as Record<string, unknown>

  const providerType = b?.providerType
  if (!providerType || !VALID_PROVIDER_TYPES.includes(providerType as AIProviderType))
    errors.providerType = `Must be one of: ${VALID_PROVIDER_TYPES.join(', ')}`

  const displayName = b?.displayName
  if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0)
    errors.displayName = 'Required, non-empty string'
  else if (displayName.length > 60)
    errors.displayName = 'Must be 60 characters or fewer'

  const apiKey = b?.apiKey
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0)
    errors.apiKey = 'Required, non-empty string'

  const model = b?.model
  if (!model || typeof model !== 'string' || model.trim().length === 0)
    errors.model = 'Required, non-empty string'

  if (providerType === 'custom') {
    const baseUrl = b?.baseUrl
    if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim().length === 0)
      errors.baseUrl = 'Required for custom provider type'
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors }
  return {
    valid: true,
    providerType: providerType as AIProviderType,
    displayName: (displayName as string).trim(),
    apiKey: (apiKey as string).trim(),
    model: (model as string).trim(),
    baseUrl: b?.baseUrl ? (b.baseUrl as string).trim() : undefined,
    skipValidation: Boolean(b?.skipValidation),
  }
}

export type ValidationResult = 'valid' | 'invalid' | 'timeout'

export async function validateApiKeyWithProvider(
  providerType: AIProviderType,
  apiKey: string,
  baseUrl?: string,
): Promise<ValidationResult> {
  const base = baseUrl ?? PREDEFINED_BASE_URLS[providerType]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    let res: Response
    if (providerType === 'anthropic') {
      res = await fetch(`${base}/v1/models`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: controller.signal,
      })
    } else {
      res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      })
    }
    clearTimeout(timer)
    if (res.status === 401 || res.status === 403) return 'invalid'
    return 'valid'
  } catch {
    clearTimeout(timer)
    return 'timeout'
  }
}

// Stub — replaced with full implementation in Task 6
export function createAIProvidersRouter(_db: Db): Router {
  return Router()
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/bot && yarn test src/__tests__/ai-provider-routes.test.ts
```

Expected: all 14 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/routes/ai-providers.ts apps/bot/src/__tests__/ai-provider-routes.test.ts
git commit -m "feat(routes): add AI provider body validation and API key check with tests"
```

---

## Task 6: Express Router & Server Wiring

**Files:**
- Modify: `apps/bot/src/routes/ai-providers.ts` (replace the stub router)
- Modify: `apps/bot/src/server.ts`

- [ ] **Step 1: Replace the stub router with the full implementation**

Replace `createAIProvidersRouter` at the bottom of `apps/bot/src/routes/ai-providers.ts`:

```typescript
export function createAIProvidersRouter(db: Db): Router {
  const router = Router()

  router.get('/api/ai-providers', (_req, res) => {
    res.json(getAllProviders(db))
  })

  router.post('/api/ai-providers', async (req, res) => {
    const parsed = validateAIProviderBody(req.body)
    if (!parsed.valid) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.errors } })
      return
    }
    if (!parsed.skipValidation) {
      const result = await validateApiKeyWithProvider(parsed.providerType, parsed.apiKey, parsed.baseUrl)
      if (result === 'invalid') {
        res.status(400).json({ error: { code: 'INVALID_API_KEY', message: `La API key es inválida para ${parsed.providerType}` } })
        return
      }
      if (result === 'timeout') {
        res.status(422).json({ error: { code: 'VALIDATION_TIMEOUT', message: `No se pudo verificar con ${parsed.providerType}`, canForce: true } })
        return
      }
    }
    const row = insertProvider(db, {
      providerType: parsed.providerType,
      displayName: parsed.displayName,
      apiKey: parsed.apiKey,
      baseUrl: parsed.baseUrl ?? null,
      model: parsed.model,
    })
    res.status(201).json(row)
  })

  router.put('/api/ai-providers/:id', async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid provider id' } })
      return
    }
    const b = req.body as Record<string, unknown>
    const input: Parameters<typeof updateProvider>[2] = {}
    if (b.displayName !== undefined) input.displayName = String(b.displayName).trim()
    if (b.model !== undefined) input.model = String(b.model).trim()
    if (b.baseUrl !== undefined) input.baseUrl = b.baseUrl ? String(b.baseUrl).trim() : null
    if (b.apiKey) {
      const newKey = String(b.apiKey).trim()
      if (!Boolean(b.skipValidation)) {
        const existing = getAllProviders(db).find(p => p.id === id)
        if (!existing) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found' } })
          return
        }
        const result = await validateApiKeyWithProvider(existing.providerType, newKey, existing.baseUrl ?? undefined)
        if (result === 'invalid') {
          res.status(400).json({ error: { code: 'INVALID_API_KEY', message: `La API key es inválida para ${existing.providerType}` } })
          return
        }
        if (result === 'timeout') {
          res.status(422).json({ error: { code: 'VALIDATION_TIMEOUT', message: 'No se pudo verificar', canForce: true } })
          return
        }
      }
      input.apiKey = newKey
    }
    const row = updateProvider(db, id, input)
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found' } })
      return
    }
    res.json(row)
  })

  router.put('/api/ai-providers/:id/activate', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid provider id' } })
      return
    }
    if (!activateProvider(db, id)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found' } })
      return
    }
    res.json({ ok: true })
  })

  router.delete('/api/ai-providers/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid provider id' } })
      return
    }
    if (!deleteProvider(db, id)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found' } })
      return
    }
    res.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 2: Wire into server.ts**

Add after all existing imports:

```typescript
import { createAIProvidersRouter } from './routes/ai-providers.js'
```

Add the fail-fast check **before `const app = express()`**:

```typescript
if (!process.env.ENCRYPTION_MASTER_KEY) {
  console.error(
    'FATAL: ENCRYPTION_MASTER_KEY is required.\n' +
    'Generate one with: openssl rand -hex 32\n' +
    'Then add ENCRYPTION_MASTER_KEY=<value> to your .env file.'
  )
  process.exit(1)
}
```

Add auth middleware + router mount after the existing `/api/config` block:

```typescript
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/ai-providers')) { next(); return }
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})
app.use(createAIProvidersRouter(getDb()))
```

- [ ] **Step 3: Add ENCRYPTION_MASTER_KEY to .env.example**

In `.env.example`, add after `JWT_SECRET`:

```
# Encryption key for stored API keys — generate with: openssl rand -hex 32
ENCRYPTION_MASTER_KEY=generate-a-64-char-hex-string-here
```

- [ ] **Step 4: Add the key to your local environment**

```bash
echo "ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)" >> .env
```

- [ ] **Step 5: Verify server starts**

```bash
cd apps/bot && yarn dev
```

Expected: server running on port 3001. Curl test:

```bash
curl -s http://localhost:3001/api/health
# → {"ok":true}
curl -s http://localhost:3001/api/ai-providers
# → {"error":"Unauthorized"}  (no token = 401, as expected)
```

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/routes/ai-providers.ts apps/bot/src/server.ts .env.example
git commit -m "feat(server): mount AI providers router with auth and fail-fast key check"
```

---

## Task 7: Command Parser Refactor

**Files:**
- Modify: `apps/bot/src/ai/command-parser.ts`

- [ ] **Step 1: Remove module-level env-var singletons**

Delete these lines from `apps/bot/src/ai/command-parser.ts`:

```typescript
// DELETE these 9 lines:
const AI_PROVIDER = process.env.AI_PROVIDER ?? 'anthropic'
const anthropic = AI_PROVIDER === 'anthropic' ? new Anthropic() : null
const openai = AI_PROVIDER === 'openai'
  ? new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null
const AI_MODEL = process.env.AI_MODEL ?? (
  AI_PROVIDER === 'openai' ? 'MiniMax-M2.5' : 'claude-sonnet-4-20250514'
)
```

- [ ] **Step 2: Add import and update ParseCommandOptions**

Add at the top:

```typescript
import type { ActiveProviderConfig } from '../db/ai-providers.js'
```

Change `ParseCommandOptions`:

```typescript
export interface ParseCommandOptions {
  memoryDir: string
  providerConfig: ActiveProviderConfig
}
```

- [ ] **Step 3: Update parseCommandAnthropic to accept client and model**

Change signature from:
```typescript
async function parseCommandAnthropic(prompt: string, memoryDir: string): Promise<CommandResponse>
```

To:
```typescript
async function parseCommandAnthropic(
  prompt: string,
  memoryDir: string,
  client: Anthropic,
  model: string,
): Promise<CommandResponse>
```

Inside the function body, replace `anthropic!.messages.create(...)` with `client.messages.create(...)`, and replace `AI_MODEL` with `model`.

- [ ] **Step 4: Update parseCommandOpenAI to accept client and model**

Change signature from:
```typescript
async function parseCommandOpenAI(prompt: string, memoryDir: string): Promise<CommandResponse>
```

To:
```typescript
async function parseCommandOpenAI(
  prompt: string,
  memoryDir: string,
  client: OpenAI,
  model: string,
): Promise<CommandResponse>
```

Inside the function body, replace `openai!.chat.completions.create(...)` with `client.chat.completions.create(...)`, and replace `AI_MODEL` with `model`.

- [ ] **Step 5: Replace the body of the public parseCommand function**

```typescript
export async function parseCommand(
  command: string,
  ctx: BotContext,
  options: ParseCommandOptions,
  historyContext?: string,
): Promise<CommandResponse> {
  const prompt = buildPrompt(command, ctx, historyContext)
  const { providerConfig } = options

  try {
    if (providerConfig.providerType === 'anthropic') {
      const client = new Anthropic({ apiKey: providerConfig.apiKey })
      return await parseCommandAnthropic(prompt, options.memoryDir, client, providerConfig.model)
    }
    // All other providers are OpenAI-compatible
    const client = new OpenAI({ baseURL: providerConfig.baseUrl, apiKey: providerConfig.apiKey })
    return await parseCommandOpenAI(prompt, options.memoryDir, client, providerConfig.model)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Re-throw auth errors so socket/events.ts can show a helpful message
    if (msg.includes('401') || msg.toLowerCase().includes('authentication')
      || msg.toLowerCase().includes('api key')) {
      throw err
    }
    console.error('[AI] API call failed:', msg)
    return {
      understood: `Error al contactar la IA: ${msg.slice(0, 100)}`,
      actions: [],
    }
  }
}
```

- [ ] **Step 6: Type-check**

```bash
cd apps/bot && yarn tsc --noEmit
```

Expected: no errors. If `command-parser.test.ts` imports `ParseCommandOptions`, update those calls to include a dummy `providerConfig`:

```typescript
const dummyProvider: ActiveProviderConfig = {
  id: 1, providerType: 'anthropic', apiKey: 'test-key',
  baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6', displayName: 'Test',
}
```

- [ ] **Step 7: Run all bot tests**

```bash
cd apps/bot && yarn test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/bot/src/ai/command-parser.ts apps/bot/src/__tests__/command-parser.test.ts
git commit -m "refactor(ai): remove env-var singletons; accept ActiveProviderConfig per call"
```

---

## Task 8: Socket Events — Provider Resolution

**Files:**
- Modify: `apps/bot/src/socket/events.ts`

- [ ] **Step 1: Add imports**

Add to the import block in `apps/bot/src/socket/events.ts`:

```typescript
import { getActiveProviderConfig, touchLastUsed, type ActiveProviderConfig } from '../db/ai-providers.js'
```

- [ ] **Step 2: Replace the voice:command handler's try block**

The current `try` block starts around line 202 and calls `parseCommand(command.text, ctx, { memoryDir }, historyContext)`.

Declare `providerConfig` before the `try` so it's accessible in the `catch`. Replace the full `try/catch/finally` block with:

```typescript
      let providerConfig: ActiveProviderConfig | null = null
      try {
        const db = getDb()
        const recentRows = getRecentHistory(db, 10)
        const historyContext = formatHistoryForPrompt(recentRows)
        const memoryDir = process.env.MEMORY_DIR ?? './data/memories'

        providerConfig = getActiveProviderConfig(db)
        if (!providerConfig) {
          io.emit('command:response', {
            understood: 'No hay proveedor de IA configurado. Ve al panel de Proveedores en el dashboard.',
            actions: [],
          })
          setActiveCommand(false)
          return
        }

        const response = await parseCommand(command.text, ctx, { memoryDir, providerConfig }, historyContext)

        touchLastUsed(db, providerConfig.id)

        try {
          saveConversation(db, {
            player: 'Player',
            command: command.text,
            understood: response.understood,
            actions: response.actions,
          })
        } catch (err) {
          console.error('[Socket] Failed to save conversation:', err)
        }

        io.emit('command:response', response)
        io.emit('bot:activity', makeActivityEvent('info', `Understood: ${response.understood}`))

        const log: ActivityLogger = (type, message) => {
          io.emit('bot:activity', makeActivityEvent(type, message))
        }
        await executeActions(bot, response.actions, log)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        const isAuthError = msg.includes('401')
          || msg.toLowerCase().includes('authentication')
          || msg.toLowerCase().includes('api key')
        if (isAuthError && providerConfig) {
          io.emit('command:response', {
            understood: `La API key de ${providerConfig.displayName} expiró o fue revocada. Actualizala en el panel de Proveedores.`,
            actions: [],
          })
        } else {
          console.error('[Socket] Error processing voice command:', msg)
          io.emit('bot:activity', makeActivityEvent('info', `Error: ${msg}`))
        }
      } finally {
        setActiveCommand(false)
      }
```

- [ ] **Step 3: Type-check**

```bash
cd apps/bot && yarn tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test manually**

Start `yarn dev`. Open dashboard. Send a command with no provider configured → expect "No hay proveedor de IA configurado" in the command response area.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/socket/events.ts
git commit -m "feat(socket): resolve active AI provider before parseCommand; handle expired key"
```

---

## Task 9: Frontend Hook

**Files:**
- Create: `apps/web/src/hooks/useAIProviders.ts`

- [ ] **Step 1: Implement the hook**

```typescript
// apps/web/src/hooks/useAIProviders.ts
import { useState, useEffect, useCallback } from 'react'
import type { AIProvider } from '@minebot/shared'

export interface AddProviderData {
  providerType: string
  displayName: string
  apiKey: string
  model: string
  baseUrl?: string
  skipValidation?: boolean
}

export interface AddProviderResult {
  ok: boolean
  canForce?: boolean
  error?: string
}

export function useAIProviders(token: string) {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-providers', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      setProviders(await res.json() as AIProvider[])
    } catch (err) {
      console.error('[useAIProviders] Failed to load:', err)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const jsonHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const addProvider = useCallback(async (data: AddProviderData): Promise<AddProviderResult> => {
    try {
      const res = await fetch('/api/ai-providers', {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify(data),
      })
      if (res.ok) { await load(); return { ok: true } }
      const body = await res.json() as { error: { message: string; canForce?: boolean } }
      if (res.status === 422 && body.error?.canForce)
        return { ok: false, canForce: true, error: body.error.message }
      return { ok: false, error: body.error?.message ?? 'Error desconocido' }
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor' }
    }
  }, [token, load])

  const updateProvider = useCallback(async (id: number, data: Partial<AddProviderData>): Promise<void> => {
    await fetch(`/api/ai-providers/${id}`, {
      method: 'PUT', headers: jsonHeaders, body: JSON.stringify(data),
    })
    await load()
  }, [token, load])

  const activateProvider = useCallback(async (id: number): Promise<void> => {
    await fetch(`/api/ai-providers/${id}/activate`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    })
    await load()
  }, [token, load])

  const deleteProvider = useCallback(async (id: number): Promise<void> => {
    await fetch(`/api/ai-providers/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    await load()
  }, [token, load])

  const activeProvider = providers.find(p => p.isActive) ?? null

  return { providers, loading, activeProvider, addProvider, updateProvider, activateProvider, deleteProvider }
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && yarn tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useAIProviders.ts
git commit -m "feat(web): add useAIProviders hook"
```

---

## Task 10: Frontend AIProviderPanel Component

**Files:**
- Create: `apps/web/src/components/AIProviderPanel.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// apps/web/src/components/AIProviderPanel.tsx
import { useState } from 'react'
import type { AIProvider, AIProviderType } from '@minebot/shared'
import type { AddProviderData, AddProviderResult } from '../hooks/useAIProviders.js'

const PROVIDER_LABELS: Record<AIProviderType, string> = {
  anthropic: 'Anthropic (Claude)', openai: 'OpenAI (GPT)', deepseek: 'DeepSeek',
  minimax: 'MiniMax', glm: 'GLM (Zhipu)', groq: 'Groq', custom: 'OpenAI-compatible (custom)',
}

const DEFAULT_MODELS: Record<AIProviderType, string> = {
  anthropic: 'claude-sonnet-4-6', openai: 'gpt-4o', deepseek: 'deepseek-v4-flash',
  minimax: 'MiniMax-M2.7', glm: 'glm-5.1', groq: 'llama-3.3-70b-versatile', custom: '',
}

const DEFAULT_BASE_URLS: Record<AIProviderType, string> = {
  anthropic: 'https://api.anthropic.com', openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com', minimax: 'https://api.minimax.io/v1',
  glm: 'https://api.z.ai/api/paas/v4/', groq: 'https://api.groq.com/openai/v1', custom: '',
}

const ALL_TYPES = Object.keys(PROVIDER_LABELS) as AIProviderType[]

interface FormState {
  providerType: AIProviderType; displayName: string; apiKey: string
  model: string; baseUrl: string; showKey: boolean
}

const EMPTY_FORM: FormState = {
  providerType: 'anthropic', displayName: '', apiKey: '',
  model: DEFAULT_MODELS.anthropic, baseUrl: DEFAULT_BASE_URLS.anthropic, showKey: false,
}

interface Props {
  providers: AIProvider[]
  loading: boolean
  onAdd: (data: AddProviderData) => Promise<AddProviderResult>
  onActivate: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onUpdate: (id: number, data: Partial<AddProviderData>) => Promise<void>
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--mc-bg-dark)', border: '2px solid var(--mc-border)',
  color: 'var(--mc-text)', padding: '0.4rem 0.5rem', fontFamily: 'inherit',
  fontSize: '0.65rem', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.5rem', color: 'var(--mc-text-muted, #aaa)',
  letterSpacing: '1px', marginBottom: '0.2rem', display: 'block',
}

export function AIProviderPanel({ providers, loading, onAdd, onActivate, onDelete, onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [pendingForce, setPendingForce] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  function openAddForm() {
    setForm(EMPTY_FORM); setEditingId(null); setStatus('idle')
    setErrorMsg(''); setPendingForce(false); setShowForm(true)
  }

  function openEditForm(p: AIProvider) {
    setForm({
      providerType: p.providerType, displayName: p.displayName, apiKey: '',
      model: p.model, baseUrl: p.baseUrl ?? DEFAULT_BASE_URLS[p.providerType], showKey: false,
    })
    setEditingId(p.id); setStatus('idle'); setErrorMsg(''); setPendingForce(false); setShowForm(true)
  }

  function handleTypeChange(t: AIProviderType) {
    setForm(f => ({ ...f, providerType: t, model: DEFAULT_MODELS[t], baseUrl: DEFAULT_BASE_URLS[t] }))
  }

  async function handleSubmit(skipValidation = false) {
    setStatus('saving'); setErrorMsg(''); setPendingForce(false)
    let result: AddProviderResult
    if (editingId !== null) {
      await onUpdate(editingId, {
        displayName: form.displayName.trim() || PROVIDER_LABELS[form.providerType],
        model: form.model,
        baseUrl: form.providerType === 'custom' ? form.baseUrl : undefined,
        ...(form.apiKey ? { apiKey: form.apiKey, skipValidation } : {}),
      })
      result = { ok: true }
    } else {
      result = await onAdd({
        providerType: form.providerType,
        displayName: form.displayName.trim() || PROVIDER_LABELS[form.providerType],
        apiKey: form.apiKey, model: form.model,
        baseUrl: form.providerType === 'custom' ? form.baseUrl : undefined,
        skipValidation,
      })
    }
    if (result.ok) {
      setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setStatus('idle')
    } else if (result.canForce) {
      setStatus('error'); setErrorMsg(result.error ?? 'No se pudo verificar la key'); setPendingForce(true)
    } else {
      setStatus('error'); setErrorMsg(result.error ?? 'Error desconocido')
    }
  }

  return (
    <div className="mc-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="mc-title">PROVEEDORES DE IA</div>
        {!showForm && (
          <button className="mc-btn" onClick={openAddForm} style={{ fontSize: '0.5rem', padding: '0.3rem 0.6rem' }}>
            + AGREGAR
          </button>
        )}
      </div>

      {loading && <div style={{ fontSize: '0.5rem', color: 'var(--mc-text-muted, #aaa)' }}>Cargando...</div>}
      {!loading && providers.length === 0 && !showForm && (
        <div style={{ fontSize: '0.5rem', color: 'var(--mc-text-muted, #aaa)' }}>
          Sin proveedores. Agrega uno para que el bot pueda usar IA.
        </div>
      )}

      {providers.map(p => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem',
          background: p.isActive ? 'rgba(85,255,85,0.08)' : 'var(--mc-bg-dark)',
          border: `1px solid ${p.isActive ? 'var(--mc-success, #55ff55)' : 'var(--mc-border)'}`,
          fontSize: '0.55rem',
        }}>
          <span style={{ color: p.isActive ? 'var(--mc-success, #55ff55)' : 'var(--mc-text-muted, #aaa)', fontSize: '0.6rem' }}>
            {p.isActive ? '●' : '○'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--mc-text)', fontWeight: 'bold' }}>{p.displayName}</div>
            <div style={{ color: 'var(--mc-text-muted, #aaa)', fontSize: '0.5rem' }}>{p.model} · {p.maskedKey}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
            {!p.isActive && (
              <button className="mc-btn" onClick={() => onActivate(p.id)} style={{ fontSize: '0.45rem', padding: '0.2rem 0.4rem' }}>
                ACTIVAR
              </button>
            )}
            <button className="mc-btn" onClick={() => openEditForm(p)} style={{ fontSize: '0.45rem', padding: '0.2rem 0.4rem' }}>
              EDITAR
            </button>
            {confirmDeleteId === p.id ? (
              <>
                <button onClick={() => { onDelete(p.id); setConfirmDeleteId(null) }}
                  style={{ fontSize: '0.45rem', padding: '0.2rem 0.4rem', background: 'var(--mc-danger)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  CONFIRMAR
                </button>
                <button className="mc-btn" onClick={() => setConfirmDeleteId(null)} style={{ fontSize: '0.45rem', padding: '0.2rem 0.4rem' }}>
                  CANCELAR
                </button>
              </>
            ) : (
              <button className="mc-btn" onClick={() => setConfirmDeleteId(p.id)} style={{ fontSize: '0.45rem', padding: '0.2rem 0.4rem' }}>✕</button>
            )}
          </div>
        </div>
      ))}

      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--mc-border)', paddingTop: '0.5rem' }}>
          <div style={{ fontSize: '0.5rem', color: 'var(--mc-text-muted, #aaa)' }}>
            {editingId !== null ? 'EDITAR PROVEEDOR' : 'NUEVO PROVEEDOR'}
          </div>

          {editingId === null && (
            <div>
              <label style={labelStyle}>PROVEEDOR</label>
              <select style={{ ...inputStyle }} value={form.providerType}
                onChange={e => handleTypeChange(e.target.value as AIProviderType)}>
                {ALL_TYPES.map(t => <option key={t} value={t}>{PROVIDER_LABELS[t]}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>NOMBRE</label>
            <input style={inputStyle} value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              placeholder={PROVIDER_LABELS[form.providerType]} />
          </div>

          <div>
            <label style={labelStyle}>API KEY{editingId !== null ? ' (vacío = sin cambios)' : ''}</label>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <input style={{ ...inputStyle, flex: 1 }}
                type={form.showKey ? 'text' : 'password'} value={form.apiKey}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder={editingId !== null ? '(sin cambios)' : 'sk-...'} autoComplete="off" />
              <button className="mc-btn" type="button"
                onClick={() => setForm(f => ({ ...f, showKey: !f.showKey }))}
                style={{ fontSize: '0.5rem', padding: '0.2rem 0.5rem', flexShrink: 0 }}>
                {form.showKey ? 'OCULTAR' : 'VER'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
            <div>
              <label style={labelStyle}>MODELO</label>
              <input style={inputStyle} value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder={DEFAULT_MODELS[form.providerType] || 'model-name'} />
            </div>
            {(form.providerType === 'custom' || editingId !== null) && (
              <div>
                <label style={labelStyle}>BASE URL</label>
                <input style={inputStyle} value={form.baseUrl}
                  onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="https://api.example.com/v1" />
              </div>
            )}
          </div>

          {status === 'error' && (
            <div style={{ fontSize: '0.5rem', color: 'var(--mc-danger)' }}>
              {errorMsg}
              {pendingForce && (
                <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.4rem' }}>
                  <button className="mc-btn" onClick={() => handleSubmit(true)}
                    style={{ fontSize: '0.45rem', padding: '0.2rem 0.5rem' }}>
                    GUARDAR SIN VERIFICAR
                  </button>
                  <button className="mc-btn" onClick={() => { setStatus('idle'); setErrorMsg(''); setPendingForce(false) }}
                    style={{ fontSize: '0.45rem', padding: '0.2rem 0.5rem' }}>
                    CANCELAR
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="mc-btn" onClick={() => handleSubmit(false)}
              disabled={status === 'saving' || (editingId === null && !form.apiKey)}
              style={{ fontSize: '0.5rem', padding: '0.4rem 1rem' }}>
              {status === 'saving'
                ? `VERIFICANDO CON ${form.providerType.toUpperCase()}...`
                : 'VERIFICAR Y GUARDAR'}
            </button>
            <button className="mc-btn"
              onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setStatus('idle') }}
              style={{ fontSize: '0.5rem', padding: '0.4rem 0.6rem' }}>
              CANCELAR
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && yarn tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/AIProviderPanel.tsx
git commit -m "feat(web): add AIProviderPanel component"
```

---

## Task 11: Dashboard Integration

**Files:**
- Modify: `apps/web/src/components/Dashboard.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { useAIProviders } from '../hooks/useAIProviders.js'
import { AIProviderPanel } from './AIProviderPanel.js'
```

- [ ] **Step 2: Call the hook inside Dashboard**

After the existing `useSocket` and `useVoiceRecognition` calls:

```typescript
const {
  providers, loading: providersLoading, activeProvider,
  addProvider, updateProvider, activateProvider, deleteProvider,
} = useAIProviders(token)

const [showAIConfig, setShowAIConfig] = useState(false)
```

- [ ] **Step 3: Add active provider badge near the bot status area**

Find where the bot status / `BotControlButton` is rendered and add:

```tsx
{activeProvider ? (
  <span style={{
    fontSize: '0.45rem', color: 'var(--mc-text-muted, #aaa)',
    background: 'var(--mc-bg-dark)', border: '1px solid var(--mc-border)',
    padding: '0.15rem 0.4rem', letterSpacing: '0.5px',
  }}>
    {activeProvider.model}
  </span>
) : (
  <span style={{
    fontSize: '0.45rem', color: 'var(--mc-warning, #ffaa00)',
    border: '1px solid var(--mc-warning, #ffaa00)',
    padding: '0.15rem 0.4rem', letterSpacing: '0.5px',
  }}>
    SIN PROVEEDOR IA
  </span>
)}
```

- [ ] **Step 4: Add CONFIG IA toggle button**

Near the existing server config toggle button, add:

```tsx
<button className="mc-btn" onClick={() => setShowAIConfig(v => !v)}
  style={{ fontSize: '0.5rem', padding: '0.3rem 0.6rem' }}>
  {showAIConfig ? 'OCULTAR IA' : 'CONFIG IA'}
</button>
```

- [ ] **Step 5: Render AIProviderPanel**

Where `ServerConfigPanel` is rendered conditionally, add:

```tsx
{showAIConfig && (
  <AIProviderPanel
    providers={providers}
    loading={providersLoading}
    onAdd={addProvider}
    onActivate={activateProvider}
    onDelete={deleteProvider}
    onUpdate={updateProvider}
  />
)}
```

- [ ] **Step 6: Type-check**

```bash
cd apps/web && yarn tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Full end-to-end test in browser**

```bash
# from repo root
yarn dev
```

Open dashboard. Verify:
1. "CONFIG IA" button visible.
2. "SIN PROVEEDOR IA" amber badge shows.
3. Opening panel → "Sin proveedores" message.
4. Adding a provider with a real API key → verifying spinner → provider appears in list.
5. Activating it → badge changes to the model name.
6. Sending a voice command → bot responds using the configured provider.
7. Deleting the active provider → badge reverts to "SIN PROVEEDOR IA".
8. Sending a command with no provider → "No hay proveedor de IA configurado" response.

- [ ] **Step 8: Run all tests**

```bash
yarn test
```

Expected: all tests in `apps/bot` PASS.

- [ ] **Step 9: Final commit**

```bash
git add apps/web/src/components/Dashboard.tsx
git commit -m "feat(web): integrate AIProviderPanel in Dashboard with active model badge"
```

---

## Post-Implementation Checklist

- [ ] `ENCRYPTION_MASTER_KEY` missing at startup → FATAL message + process exits
- [ ] `GET /api/ai-providers` without token → 401
- [ ] `POST` with invalid key → 400 INVALID_API_KEY
- [ ] `POST` with provider timeout → 422 canForce, UI shows force-save dialog
- [ ] `POST` with `skipValidation: true` → 201 saved without verification
- [ ] Only one provider active at a time (transaction in `activateProvider`)
- [ ] `getAllProviders` response never includes `encrypted_key`
- [ ] `getActiveProviderConfig` decrypts key in memory, never logs it
- [ ] Deleting active provider → next command shows "no provider" message
- [ ] Dashboard badge reflects active provider model name (or amber "SIN PROVEEDOR IA")
