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