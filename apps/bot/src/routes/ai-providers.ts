import { Router } from 'express'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../db/schema.js'
import type { AIProviderType } from '@minebot/shared'
import { PREDEFINED_BASE_URLS } from '../db/ai-providers.js'

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

export function createAIProvidersRouter(_db: Db): Router {
  return Router()
}