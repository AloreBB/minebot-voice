import type { CommandResponse } from '@minebot/shared'

interface Props {
  transcript: string
  response: CommandResponse | null
}

export function CommandDisplay({ transcript, response }: Props) {
  if (!transcript && !response) return null

  return (
    <div className="mc-panel" style={{ padding: '0.5rem 0.75rem' }}>
      {transcript && (
        <p style={{ fontFamily: 'var(--font-terminal)', fontSize: '1rem', marginBottom: response ? '0.25rem' : 0 }}>
          <span style={{ color: 'var(--mc-diamond)' }}>Tu: </span>
          <span style={{ color: 'var(--mc-text-dim)' }}>"{transcript}"</span>
        </p>
      )}
      {response && (
        <p style={{ fontFamily: 'var(--font-terminal)', fontSize: '1rem' }}>
          <span style={{ color: 'var(--mc-success)' }}>Bot: </span>
          {response.understood}
        </p>
      )}
    </div>
  )
}
