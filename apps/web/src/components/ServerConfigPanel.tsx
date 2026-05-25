import { useState, useEffect } from 'react'
import type { ServerConfig } from '@minebot/shared'

interface Props {
  current: ServerConfig | null
  onSave: (cfg: ServerConfig) => Promise<void>
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--mc-bg-dark)',
    border: '2px solid var(--mc-border)',
    color: 'var(--mc-text)',
    padding: '0.4rem 0.5rem',
    fontFamily: 'inherit',
    fontSize: '0.65rem',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.5rem',
    color: 'var(--mc-text-muted, #aaa)',
    letterSpacing: '1px',
    marginBottom: '0.2rem',
    display: 'block',
  }

  return (
    <div className="mc-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div className="mc-title">SERVIDOR</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem' }}>
        <div>
          <label style={labelStyle}>HOST</label>
          <input
            style={inputStyle}
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="mc.example.com"
          />
        </div>
        <div style={{ width: '5rem' }}>
          <label style={labelStyle}>PUERTO</label>
          <input
            style={inputStyle}
            value={port}
            onChange={e => setPort(e.target.value)}
            placeholder="25565"
            type="number"
            min={1}
            max={65535}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <div>
          <label style={labelStyle}>USUARIO</label>
          <input
            style={inputStyle}
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="MineBot"
            maxLength={16}
          />
        </div>
        <div>
          <label style={labelStyle}>VERSIÓN (opcional)</label>
          <input
            style={inputStyle}
            value={version}
            onChange={e => setVersion(e.target.value)}
            placeholder="auto (ej: 1.20.4)"
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          className="mc-btn"
          onClick={handleSave}
          disabled={status === 'saving'}
          style={{ fontSize: '0.5rem', padding: '0.4rem 1rem' }}
        >
          {status === 'saving' ? 'GUARDANDO...' : status === 'saved' ? 'GUARDADO ✓' : 'GUARDAR'}
        </button>
        <span style={{ fontSize: '0.45rem', color: 'var(--mc-text-muted, #aaa)' }}>
          Aplica al próximo AGREGAR
        </span>
      </div>

      {status === 'error' && (
        <div style={{ fontSize: '0.5rem', color: 'var(--mc-danger)', marginTop: '0.2rem' }}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}