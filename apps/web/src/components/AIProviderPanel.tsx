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