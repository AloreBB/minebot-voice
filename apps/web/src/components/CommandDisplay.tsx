import type { CommandResponse } from '@minebot/shared'

interface Props {
  transcript: string
  response: CommandResponse | null
}

export function CommandDisplay({ transcript, response }: Props) {
  if (!transcript && !response) return null

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem' }}>
      {transcript && (
        <p style={{ marginBottom: '0.5rem' }}>
          <span style={{ color: 'var(--command)' }}>Tu: </span>
          "{transcript}"
        </p>
      )}
      {response && (
        <p>
          <span style={{ color: 'var(--success)' }}>Bot: </span>
          {response.understood}
        </p>
      )}
    </div>
  )
}
