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