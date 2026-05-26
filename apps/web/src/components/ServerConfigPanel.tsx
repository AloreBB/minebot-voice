import { useState, useEffect } from 'react'
import type { ServerConfig } from '@minebot/shared'

interface Props {
  current: ServerConfig | null
  onSave: (cfg: ServerConfig) => Promise<void>
}

const inputCss: React.CSSProperties = {
  width: '100%', background: 'var(--mc-bg)',
  border: '2px solid var(--mc-border-dark)',
  color: 'var(--mc-text)', padding: '0.6rem 0.75rem',
  fontFamily: 'var(--font-terminal)', fontSize: '1.3rem',
  boxSizing: 'border-box', outline: 'none',
}

const labelCss: React.CSSProperties = {
  fontFamily: 'var(--font-pixel)', fontSize: '0.45rem',
  color: 'var(--mc-text-dim)', letterSpacing: '1px',
  marginBottom: '0.4rem', display: 'block',
}

export function ServerConfigPanel({ current, onSave }: Props) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('25565')
  const [username, setUsername] = useState('')
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!current) return
    setHost(current.host)
    setPort(String(current.port))
    setUsername(current.username)
    setVersion(current.version ?? '')
  }, [current])

  async function handleSave() {
    setStatus('saving')
    setErrorMsg('')
    try {
      const portNum = parseInt(port, 10)
      if (isNaN(portNum)) throw new Error('Puerto inválido')
      await onSave({
        host: host.trim(),
        port: portNum,
        username: username.trim(),
        ...(version.trim() ? { version: version.trim() } : {}),
      })
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar')
      setStatus('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 6rem', gap: '0.75rem' }}>
        <div>
          <label style={labelCss}>HOST</label>
          <input style={inputCss} value={host}
            onChange={e => setHost(e.target.value)} placeholder="mc.example.com" />
        </div>
        <div>
          <label style={labelCss}>PUERTO</label>
          <input style={inputCss} value={port}
            onChange={e => setPort(e.target.value)}
            placeholder="25565" type="number" min={1} max={65535} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelCss}>USUARIO DEL BOT</label>
          <input style={inputCss} value={username}
            onChange={e => setUsername(e.target.value)} placeholder="MineBot" maxLength={16} />
        </div>
        <div>
          <label style={labelCss}>VERSIÓN (opcional)</label>
          <input style={inputCss} value={version}
            onChange={e => setVersion(e.target.value)} placeholder="auto · ej: 1.20.4" />
        </div>
      </div>

      {current && (
        <div style={{
          fontFamily: 'var(--font-terminal)', fontSize: '1.05rem',
          color: 'var(--mc-text-dim)', padding: '0.5rem 0.75rem',
          background: 'rgba(85,255,85,0.04)',
          border: '1px solid var(--mc-border-dark)',
        }}>
          Actual: {current.host}:{current.port} · @{current.username}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button className="mc-btn" onClick={handleSave} disabled={status === 'saving'}
          style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.2rem', padding: '0.6rem 1.5rem' }}>
          {status === 'saving' ? 'GUARDANDO...' : status === 'saved' ? '✓ GUARDADO' : 'GUARDAR'}
        </button>
        <span style={{ fontFamily: 'var(--font-terminal)', fontSize: '1rem', color: 'var(--mc-text-dim)' }}>
          Aplica al próximo reconectar
        </span>
      </div>

      {status === 'error' && (
        <div style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.1rem', color: 'var(--mc-danger)' }}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}
