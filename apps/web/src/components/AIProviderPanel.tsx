import { useState } from 'react'
import type { AIProvider, AIProviderType } from '@minebot/shared'
import type { AddProviderData, AddProviderResult } from '../hooks/useAIProviders.js'

const PROVIDER_LABELS: Record<AIProviderType, string> = {
  anthropic: 'Anthropic (Claude)', openai: 'OpenAI (GPT)', deepseek: 'DeepSeek',
  minimax: 'MiniMax', glm: 'GLM (Zhipu)', groq: 'Groq', custom: 'Compatible OpenAI',
}

const PROVIDER_ABBR: Record<AIProviderType, string> = {
  anthropic: 'CL', openai: 'GP', deepseek: 'DS',
  minimax: 'MM', glm: 'ZH', groq: 'GQ', custom: '//',
}

export const PROVIDER_COLORS: Record<AIProviderType, string> = {
  anthropic: '#c96442', openai: '#10a37f', deepseek: '#4d6cfa',
  minimax: '#9b59b6', glm: '#e67e22', groq: '#f4a322', custom: '#5a5a7a',
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

const inputCss: React.CSSProperties = {
  width: '100%', background: 'var(--mc-bg)',
  border: '2px solid var(--mc-border-dark)',
  color: 'var(--mc-text)', padding: '0.6rem 0.75rem',
  fontFamily: 'var(--font-terminal)', fontSize: '1.2rem',
  boxSizing: 'border-box', outline: 'none',
}

const labelCss: React.CSSProperties = {
  fontFamily: 'var(--font-pixel)', fontSize: '0.45rem',
  color: 'var(--mc-text-dim)', letterSpacing: '1px',
  marginBottom: '0.4rem', display: 'block',
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

  // Active provider at top, then rest alphabetically
  const sorted = [...providers].sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontFamily: 'var(--font-pixel)', fontSize: '0.5rem',
          letterSpacing: '1px', color: 'var(--mc-text-dim)',
        }}>
          {providers.length === 0 ? 'SIN PROVEEDORES' : `${providers.length} PROVEEDOR${providers.length !== 1 ? 'ES' : ''}`}
        </span>
        {!showForm && (
          <button onClick={openAddForm} className="mc-btn"
            style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.1rem', padding: '0.4rem 1rem' }}>
            + NUEVO
          </button>
        )}
      </div>

      {loading && (
        <div style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.2rem', color: 'var(--mc-text-dim)' }}>
          Cargando...
        </div>
      )}

      {!loading && providers.length === 0 && !showForm && (
        <div style={{
          padding: '2rem 1rem', textAlign: 'center',
          border: '2px dashed var(--mc-border-dark)',
          fontFamily: 'var(--font-terminal)', fontSize: '1.2rem',
          color: 'var(--mc-text-dim)', lineHeight: 1.6,
        }}>
          Sin proveedores configurados.<br />
          <span style={{ fontSize: '1rem' }}>Agrega uno para usar IA.</span>
        </div>
      )}

      {/* Chat-roster style provider list */}
      {sorted.map(p => {
        const color = PROVIDER_COLORS[p.providerType]
        return (
          <div
            key={p.id}
            onClick={() => !p.isActive && !showForm && onActivate(p.id)}
            style={{
              display: 'flex', gap: '0.75rem', padding: '0.85rem',
              background: p.isActive ? 'rgba(85,255,85,0.05)' : 'var(--mc-bg)',
              border: `2px solid ${p.isActive ? 'var(--mc-emerald)' : 'var(--mc-border-dark)'}`,
              borderLeft: `4px solid ${p.isActive ? 'var(--mc-emerald)' : color}`,
              cursor: p.isActive || showForm ? 'default' : 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {/* Avatar */}
            <div style={{
              width: '3rem', height: '3rem', flexShrink: 0,
              background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-pixel)', fontSize: '0.48rem',
              color: '#fff', letterSpacing: '0px',
              boxShadow: p.isActive ? `0 0 14px ${color}55` : 'none',
            }}>
              {PROVIDER_ABBR[p.providerType]}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'var(--font-terminal)', fontSize: '1.4rem',
                  color: p.isActive ? 'var(--mc-text)' : 'var(--mc-text-dim)',
                  lineHeight: 1.1,
                }}>
                  {p.displayName}
                </span>
                {p.isActive && (
                  <span style={{
                    fontFamily: 'var(--font-pixel)', fontSize: '0.38rem',
                    color: 'var(--mc-emerald)', border: '1px solid var(--mc-emerald)',
                    padding: '0.1rem 0.35rem', letterSpacing: '0.5px',
                  }}>
                    ● EN USO
                  </span>
                )}
              </div>
              <div style={{
                fontFamily: 'var(--font-terminal)', fontSize: '1.05rem',
                color: 'var(--mc-text-dim)', marginTop: '0.1rem',
              }}>
                {p.model}
              </div>
              <div style={{
                fontFamily: 'var(--font-terminal)', fontSize: '0.9rem',
                color: 'var(--mc-text-dim)', letterSpacing: '0.5px',
              }}>
                {p.maskedKey}
              </div>
              {!p.isActive && !showForm && (
                <div style={{
                  fontFamily: 'var(--font-terminal)', fontSize: '0.85rem',
                  color: color, marginTop: '0.2rem',
                }}>
                  → toca para activar
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flexShrink: 0 }}>
              <button
                onClick={e => { e.stopPropagation(); openEditForm(p) }}
                className="mc-btn"
                title="Editar"
                style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.1rem', padding: '0.35rem 0.65rem' }}
              >
                ✎
              </button>
              {confirmDeleteId === p.id ? (
                <>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(p.id); setConfirmDeleteId(null) }}
                    style={{
                      fontFamily: 'var(--font-terminal)', fontSize: '1.1rem', padding: '0.35rem 0.5rem',
                      background: 'var(--mc-danger)', color: '#fff', border: 'none', cursor: 'pointer',
                    }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(null) }}
                    className="mc-btn"
                    style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.1rem', padding: '0.35rem 0.5rem' }}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id) }}
                  className="mc-btn"
                  title="Eliminar"
                  style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.1rem', padding: '0.35rem 0.65rem' }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Add / Edit form */}
      {showForm && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '0.85rem',
          padding: '1rem',
          background: 'var(--mc-bg)',
          border: '2px solid var(--mc-border-dark)',
          borderLeft: `4px solid ${PROVIDER_COLORS[form.providerType]}`,
        }}>
          <div style={{
            fontFamily: 'var(--font-pixel)', fontSize: '0.5rem',
            color: 'var(--mc-text-dim)', letterSpacing: '1px',
          }}>
            {editingId !== null ? '— EDITAR PROVEEDOR —' : '— NUEVO PROVEEDOR —'}
          </div>

          {editingId === null && (
            <div>
              <label style={labelCss}>TIPO DE PROVEEDOR</label>
              <select style={{ ...inputCss }} value={form.providerType}
                onChange={e => handleTypeChange(e.target.value as AIProviderType)}>
                {ALL_TYPES.map(t => <option key={t} value={t}>{PROVIDER_LABELS[t]}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={labelCss}>NOMBRE</label>
            <input style={inputCss} value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              placeholder={PROVIDER_LABELS[form.providerType]} />
          </div>

          <div>
            <label style={labelCss}>API KEY{editingId !== null ? ' (vacío = sin cambios)' : ''}</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input style={{ ...inputCss, flex: 1 }}
                type={form.showKey ? 'text' : 'password'} value={form.apiKey}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder={editingId !== null ? '(sin cambios)' : 'sk-...'} autoComplete="off" />
              <button className="mc-btn" type="button"
                onClick={() => setForm(f => ({ ...f, showKey: !f.showKey }))}
                style={{ fontFamily: 'var(--font-terminal)', fontSize: '1rem', padding: '0.3rem 0.85rem', flexShrink: 0 }}>
                {form.showKey ? 'OCULTAR' : 'VER'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={labelCss}>MODELO</label>
              <input style={inputCss} value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder={DEFAULT_MODELS[form.providerType] || 'model-name'} />
            </div>
            {(form.providerType === 'custom' || editingId !== null) && (
              <div>
                <label style={labelCss}>BASE URL</label>
                <input style={inputCss} value={form.baseUrl}
                  onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="https://api.example.com/v1" />
              </div>
            )}
          </div>

          {status === 'error' && (
            <div style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.1rem', color: 'var(--mc-danger)' }}>
              {errorMsg}
              {pendingForce && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="mc-btn" onClick={() => handleSubmit(true)}
                    style={{ fontFamily: 'var(--font-terminal)', fontSize: '1rem', padding: '0.4rem 0.85rem' }}>
                    GUARDAR SIN VERIFICAR
                  </button>
                  <button className="mc-btn"
                    onClick={() => { setStatus('idle'); setErrorMsg(''); setPendingForce(false) }}
                    style={{ fontFamily: 'var(--font-terminal)', fontSize: '1rem', padding: '0.4rem 0.85rem' }}>
                    CANCELAR
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="mc-btn" onClick={() => handleSubmit(false)}
              disabled={status === 'saving' || (editingId === null && !form.apiKey)}
              style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.15rem', padding: '0.6rem 1.4rem' }}>
              {status === 'saving' ? 'VERIFICANDO...' : 'VERIFICAR Y GUARDAR'}
            </button>
            <button className="mc-btn"
              onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setStatus('idle') }}
              style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.15rem', padding: '0.6rem 1rem' }}>
              CANCELAR
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
