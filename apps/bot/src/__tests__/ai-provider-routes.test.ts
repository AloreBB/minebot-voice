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