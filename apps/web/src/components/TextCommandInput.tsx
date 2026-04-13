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
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '4px' }}>
      <div className="mc-inset" style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        padding: '0 0.5rem',
      }}>
        <span style={{
          fontFamily: 'var(--font-terminal)',
          color: 'var(--mc-diamond)',
          fontSize: '1.1rem',
          marginRight: '0.3rem',
        }}>/</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un comando..."
          disabled={disabled}
          style={{
            flex: 1,
            padding: '0.5rem 0',
            background: 'transparent',
            border: 'none',
            color: 'var(--mc-text)',
            fontFamily: 'var(--font-terminal)',
            fontSize: '1.1rem',
            outline: 'none',
          }}
        />
      </div>
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="mc-btn"
        style={{ padding: '0.5rem 0.75rem', fontSize: '0.5rem' }}
      >
        &gt;
      </button>
    </form>
  )
}
