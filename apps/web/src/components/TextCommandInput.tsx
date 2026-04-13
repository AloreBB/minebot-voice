import { useState, useCallback, type FormEvent } from 'react'

interface Props {
  onSend: (text: string) => void
  disabled?: boolean
}

export function TextCommandInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('')

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const trimmed = text.trim()
      if (!trimmed) return
      onSend(trimmed)
      setText('')
    },
    [text, onSend],
  )

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        gap: '0.5rem',
      }}
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribe un comando..."
        disabled={disabled}
        style={{
          flex: 1,
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          border: '1px solid var(--bg-card)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontSize: '0.95rem',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        style={{
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          border: 'none',
          background: text.trim() ? 'var(--accent)' : 'var(--bg-card)',
          color: text.trim() ? '#000' : 'var(--text-secondary)',
          fontWeight: 'bold',
          cursor: text.trim() ? 'pointer' : 'default',
          transition: 'all 0.2s',
        }}
      >
        Enviar
      </button>
    </form>
  )
}
