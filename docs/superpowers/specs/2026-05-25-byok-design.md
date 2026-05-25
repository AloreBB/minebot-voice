# BYOK — Bring Your Own Key: AI Provider Configuration

**Date:** 2026-05-25  
**Status:** Approved  
**Project:** MineBot

## Overview

Allow the dashboard owner to register multiple AI provider API keys (Anthropic, OpenAI, DeepSeek, MiniMax, GLM, Groq, or any OpenAI-compatible endpoint) via the web UI, and select which one the bot uses at runtime. Keys are stored encrypted in SQLite using AES-256-GCM. Environment variables `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AI_PROVIDER`, `AI_MODEL`, and `OPENAI_BASE_URL` are no longer used — configuration lives entirely in the database.

## Goals

- Store multiple provider configs; one is "active" at a time.
- Encrypt API keys at rest (AES-256-GCM + HKDF). Resist SQLite file leak.
- Validate keys against provider APIs before saving.
- Show masked keys in UI (`sk-...c3x4`); never return plaintext from API.
- Global provider selector in dashboard. All commands use the active provider.
- Clear error if no provider is configured when a command arrives.

## Non-Goals

- Per-command provider override (e.g., `@claude mine stone`).
- Automatic fallback to next provider on API failure.
- Key rotation UI (the `v` field in the encrypted payload enables it later, but the rotation script is out of scope).
- Multi-user support (system remains single-user).

---

## Architecture

### New env var

```
ENCRYPTION_MASTER_KEY=<64 hex chars>   # openssl rand -hex 32
```

Required at startup. If absent, server exits with:
```
FATAL: ENCRYPTION_MASTER_KEY is required. Generate one with: openssl rand -hex 32
```

Existing `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AI_PROVIDER`, `AI_MODEL`, `OPENAI_BASE_URL` are ignored and can be removed from `.env`.

### New files

| File | Purpose |
|------|---------|
| `apps/bot/src/crypto.ts` | AES-256-GCM encrypt/decrypt/mask using `node:crypto` |
| `apps/bot/src/db/ai-providers.ts` | DB queries for `ai_providers` table |
| `apps/bot/src/routes/ai-providers.ts` | REST endpoints |
| `apps/web/src/components/AIProviderPanel.tsx` | UI panel |
| `apps/web/src/hooks/useAIProviders.ts` | React hook for provider state |

### Modified files

| File | Change |
|------|--------|
| `apps/bot/src/db/schema.ts` | Add `aiProviders` table |
| `apps/bot/src/ai/command-parser.ts` | Remove env-var singletons; accept `ActiveProviderConfig` param |
| `apps/bot/src/socket/events.ts` | Resolve active provider before calling `parseCommand` |
| `apps/bot/src/server.ts` | Mount `/api/ai-providers` router; fail-fast on missing master key |
| `apps/web/src/components/Dashboard.tsx` | Add `AIProviderPanel`; show active provider badge |
| `packages/shared/src/types.ts` | Add `AIProvider` type for socket/API contracts |

---

## Database Schema

```typescript
// apps/bot/src/db/schema.ts
export const aiProviders = sqliteTable('ai_providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  providerType: text('provider_type').notNull(),
  // 'anthropic' | 'openai' | 'deepseek' | 'minimax' | 'glm' | 'groq' | 'custom'
  displayName: text('display_name').notNull(),
  encryptedKey: text('encrypted_key').notNull(), // JSON: {v,iv,tag,ct} hex-encoded
  maskedKey: text('masked_key').notNull(),         // e.g. "sk-...c3x4"
  baseUrl: text('base_url'),                       // null for predefined providers
  model: text('model').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  lastUsedAt: integer('last_used_at'),
})
```

Only one row may have `is_active = true` at a time. The `activate` DB function wraps both updates in a single SQLite transaction.

`getActiveProviderConfig(db)` resolves `baseUrl: null` (stored for predefined providers) to the canonical URL from the Predefined Providers table, so `ActiveProviderConfig.baseUrl` is always a non-null string.

`lastUsedAt` is updated in `socket/events.ts` after `parseCommand` returns successfully (even if the response is an error message — any completed AI call counts).

---

## Encryption Service (`apps/bot/src/crypto.ts`)

Uses only `node:crypto` — no new dependencies.

```typescript
interface EncryptedPayload {
  v: number   // key version (1 = current); enables future master key rotation
  iv: string  // hex, 12 bytes (96 bits) — random per encrypt call
  tag: string // hex, 16 bytes — GCM auth tag
  ct: string  // hex — ciphertext
}

// Derives a 256-bit subkey via HKDF-SHA256 from ENCRYPTION_MASTER_KEY.
// Purpose string "minebot:user-api-keys-v1" separates domain from other potential uses.

encryptApiKey(plaintext: string): EncryptedPayload
decryptApiKey(payload: EncryptedPayload): string  // throws if GCM tag mismatch
maskApiKey(key: string): string
// key.length <= 8 → "****"
// else → first 3 chars + "..." + last 4 chars
// e.g. "sk-ant-api03-AbcXyz" → "sk-...cXyz"
```

The encrypted payload is stored as `JSON.stringify(EncryptedPayload)` in `encrypted_key`. The masked value is stored separately so list endpoints never need to decrypt.

---

## Predefined Providers

| `providerType` | SDK | `baseUrl` | Default model |
|---|---|---|---|
| `anthropic` | Anthropic SDK | `https://api.anthropic.com` | `claude-sonnet-4-6` |
| `openai` | OpenAI SDK | `https://api.openai.com/v1` | `gpt-4o` |
| `deepseek` | OpenAI SDK | `https://api.deepseek.com` | `deepseek-v4-flash` |
| `minimax` | OpenAI SDK | `https://api.minimax.io/v1` | `MiniMax-M2.7` |
| `glm` | OpenAI SDK | `https://api.z.ai/api/paas/v4/` | `glm-5.1` |
| `groq` | OpenAI SDK | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| `custom` | OpenAI SDK | user-defined | user-defined |

Only `anthropic` uses the Anthropic SDK. All others use the OpenAI SDK with a custom `baseURL` — already supported by the existing code.

---

## API Routes (`/api/ai-providers`)

All routes require `Authorization: Bearer <token>`.

### `GET /api/ai-providers`
Returns all registered providers. Never returns plaintext keys.

```json
[
  {
    "id": 1,
    "providerType": "anthropic",
    "displayName": "Mi Claude Sonnet",
    "maskedKey": "sk-...c3x4",
    "baseUrl": null,
    "model": "claude-sonnet-4-6",
    "isActive": true,
    "createdAt": 1748217600000,
    "lastUsedAt": 1748217900000
  }
]
```

### `POST /api/ai-providers`
Adds a new provider. Validates the key before saving.

Request body:
```json
{
  "providerType": "deepseek",
  "displayName": "DeepSeek V4",
  "apiKey": "sk-...",
  "model": "deepseek-v4-flash",
  "baseUrl": null
}
```

Flow:
1. Validate body shape (all required fields, model non-empty, baseUrl required if `custom`).
2. Send test request to provider API (8s timeout):
   - `anthropic`: `GET /v1/models` with `x-api-key` header
   - all others: `GET {baseUrl}/models` with `Authorization: Bearer {apiKey}`
3. If 401/403 → 400 `{ error: { code: "INVALID_API_KEY", message: "La API key es inválida para DeepSeek" } }`
4. If timeout or 5xx → 422 `{ error: { code: "VALIDATION_TIMEOUT", message: "No se pudo verificar con DeepSeek", canForce: true } }`. Does NOT save yet.
5. Encrypt key, compute mask, insert row.
6. Return 201 with provider record (masked).

For the force-save path (user clicks "Guardar sin verificar" after a timeout): re-send the same POST body with `"skipValidation": true`. The endpoint skips step 2 and proceeds directly to encrypt + insert.

### `PUT /api/ai-providers/:id`
Updates `displayName`, `model`, `baseUrl`, and optionally the key. If `apiKey` is included in the body, re-validates and re-encrypts.

### `PUT /api/ai-providers/:id/activate`
Sets `is_active = true` for this row and `false` for all others in one transaction. Returns 200 `{ ok: true }`. Returns 404 if `id` does not exist.

### `DELETE /api/ai-providers/:id`
Removes the provider. If it was active, the bot will respond to the next command with the "no provider configured" message. Returns 200 `{ ok: true }`.

---

## Command Parser Changes

### Before (module-level singletons, env-var driven)
```typescript
const AI_PROVIDER = process.env.AI_PROVIDER ?? 'anthropic'
const anthropic = AI_PROVIDER === 'anthropic' ? new Anthropic() : null
const openai = AI_PROVIDER === 'openai' ? new OpenAI({ ... }) : null
```

### After (per-call, config-driven)
```typescript
export interface ActiveProviderConfig {
  providerType: 'anthropic' | 'openai' | 'deepseek' | 'minimax' | 'glm' | 'groq' | 'custom'
  apiKey: string   // plaintext, decrypted in memory, never logged
  baseUrl: string  // always resolved (predefined or user-provided)
  model: string
}

export async function parseCommand(
  command: string,
  ctx: BotContext,
  options: ParseCommandOptions & { providerConfig: ActiveProviderConfig },
  historyContext?: string,
): Promise<CommandResponse>
```

Internally creates the SDK instance from `providerConfig` on each call. `providerType === 'anthropic'` uses the Anthropic SDK; all others use `new OpenAI({ baseURL, apiKey })`.

### No active provider

`socket/events.ts` calls `getActiveProviderConfig(db)` before `parseCommand`. If null:

```typescript
socket.emit('command:response', {
  understood: 'No hay proveedor de IA configurado. Ve al panel de Proveedores en el dashboard.',
  actions: [],
})
return
```

If the provider returns 401 during a command (key expired after saving):
```typescript
understood: 'La API key de Anthropic expiró o fue revocada. Actualizala en el panel de Proveedores.',
actions: [],
```

---

## Frontend UI

### `AIProviderPanel` component

Located in the dashboard alongside `ServerConfigPanel`. Sections:

**Provider list:**
- Each row: display name, model, masked key, active badge or "Activar" button, edit button, delete button.
- "Activar" triggers `PUT /api/ai-providers/:id/activate`.
- Delete shows confirmation before calling `DELETE /api/ai-providers/:id`.

**Add/Edit form:**
- Provider type selector (predefined list + Custom). On selection, pre-fills `baseUrl` and `model` (both editable).
- Display name field.
- API Key field (`type="password"` with show/hide toggle). On edit, placeholder shows masked key; leave empty to keep existing key.
- Model field with suggested values per provider type.
- Base URL field (visible only for `custom` type).
- Submit button states: idle → "Verificar y guardar" / loading → "Verificando con [Provider]..." / error → toast.

**Unverifiable key UX:**
If the POST returns 422 with `canForce: true` (validation timeout / provider 5xx), show a confirmation dialog:
> "No se pudo verificar la key con DeepSeek (timeout). ¿Guardar de todas formas?"
> [Cancelar] [Guardar sin verificar]

"Guardar sin verificar" re-sends the same POST with `skipValidation: true`. The provider is then added normally.

**Active provider badge:**
Small badge in the dashboard header next to the bot status indicator:
`● Conectado  [claude-sonnet-4-6]`
When no provider is configured: `[Sin proveedor IA]` in amber.

### `useAIProviders` hook

```typescript
useAIProviders(token: string): {
  providers: AIProvider[]
  loading: boolean
  addProvider(data): Promise<{ ok: boolean; warning?: string }>
  updateProvider(id, data): Promise<void>
  activateProvider(id): Promise<void>
  deleteProvider(id): Promise<void>
}
```

---

## Testing

### `crypto.test.ts`
- `encryptApiKey` → `decryptApiKey` round-trips correctly.
- Two encryptions of the same plaintext produce different IVs.
- Decrypting with corrupted `ct` throws (GCM auth tag fails).
- `maskApiKey`: keys ≤8 chars → `"****"`; long keys → `"sk-...c3x4"`.

### `ai-providers.test.ts` (DB layer, in-memory SQLite)
- Insert → getAll returns masked key, not plaintext.
- `activate(id)` sets `is_active=true` for target and `false` for all others atomically.
- `getActiveProviderConfig` returns null when no row is active.
- Delete active provider → `getActiveProviderConfig` returns null.

### `ai-provider-routes.test.ts`
- `POST` with valid key (mocked provider API response 200) → 201.
- `POST` with invalid key (mocked 401) → 400 with `INVALID_API_KEY` code.
- `POST` with provider timeout (mocked) → 422 with `VALIDATION_TIMEOUT` and `canForce: true`.
- `POST` with `skipValidation: true` (mocked timeout scenario) → 201, row saved.
- `PUT /:id/activate` → only target row has `is_active=true`.
- `DELETE /:id` → row removed.
- All routes without `Authorization` header → 401.
- `POST` when `ENCRYPTION_MASTER_KEY` not set → server should have already crashed at startup (tested via separate startup test).

---

## Security Notes

- **AES-256-GCM** with random 12-byte IV per encrypt call. Auth tag prevents tampering.
- **HKDF-SHA256** derives subkey from master key with purpose label — domain separation for future use cases.
- **`ENCRYPTION_MASTER_KEY` loss** = all stored keys irrecoverable. Must be backed up separately. Document in deployment runbook.
- **Never log `apiKey`** in plaintext. `parseCommand` must not log `providerConfig.apiKey`.
- **API response** never includes plaintext key. Only `maskedKey` is returned from list/get endpoints.
- **Body size limit** already enforced at 16kb by existing `express.json({ limit: '16kb' })`.
- **Rate limiting**: the existing login limiter does not apply to `/api/ai-providers`. These routes are already protected by JWT, which is sufficient — no unauthenticated surface.

---

## Migration / Deployment

1. Generate master key: `openssl rand -hex 32` → add to `.env` as `ENCRYPTION_MASTER_KEY`.
2. Remove (or comment out) `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AI_PROVIDER`, `AI_MODEL`, `OPENAI_BASE_URL` from `.env`.
3. Deploy. On first run, `ai_providers` table is created empty via Drizzle migration.
4. Open dashboard → Proveedores → add and activate a provider.
5. Bot will work on next command.

Old env vars can remain harmlessly if not removed — they are no longer read by the application.
