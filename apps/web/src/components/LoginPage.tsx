import { useState, type FormEvent } from 'react'

interface Props {
  onLogin: (password: string) => Promise<boolean>
}

export function LoginPage({ onLogin }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(false)
    const success = await onLogin(password)
    if (!success) setError(true)
    setLoading(false)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100dvh',
      padding: '1rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Dirt texture bar at bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '80px',
        background: 'repeating-linear-gradient(90deg, #6b4226 0px, #7a4f2e 4px, #5c3a20 8px, #6b4226 12px)',
        borderTop: '4px solid #4a2e16',
        opacity: 0.6,
        imageRendering: 'pixelated',
      }} />

      <div style={{ textAlign: 'center', marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
        <h1 style={{
          fontFamily: 'var(--font-pixel)',
          fontSize: 'clamp(1.2rem, 5vw, 2rem)',
          color: '#fff',
          textShadow: '3px 3px 0 #3a3a3a, 0 0 20px rgba(85,255,255,0.3)',
          marginBottom: '0.75rem',
          letterSpacing: '3px',
        }}>
          MINEBOT
        </h1>
        <p style={{
          fontFamily: 'var(--font-pixel)',
          fontSize: '0.5rem',
          color: 'var(--mc-text-dim)',
          letterSpacing: '2px',
        }}>
          COMMAND CENTER
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        width: '100%',
        maxWidth: '320px',
        position: 'relative',
        zIndex: 1,
      }}>
        <div className="mc-inset" style={{ padding: '2px' }}>
          <input
            type="password"
            placeholder="Password..."
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '0.6rem 0.75rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--mc-text)',
              fontFamily: 'var(--font-terminal)',
              fontSize: '1.1rem',
              outline: 'none',
            }}
          />
        </div>

        {error && (
          <p style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '0.45rem',
            color: 'var(--mc-danger)',
            textAlign: 'center',
            textShadow: '1px 1px 0 rgba(0,0,0,0.5)',
          }}>
            PASSWORD INCORRECTO
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className="mc-btn"
          style={{ width: '100%', padding: '0.75rem' }}
        >
          {loading ? 'ENTRANDO...' : 'ENTRAR'}
        </button>
      </form>
    </div>
  )
}
