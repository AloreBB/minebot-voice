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
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100dvh',
      padding: '1rem',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--bg-secondary)',
        padding: '2rem',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '360px',
      }}>
        <h1 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>MineBot Control</h1>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '8px',
            border: error ? '2px solid var(--danger)' : '2px solid transparent',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '1rem',
            marginBottom: '1rem',
          }}
        />
        {error && (
          <p style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center' }}>
            Password incorrecto
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent)',
            color: '#000',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
