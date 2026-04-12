import type { ActivityEvent } from '@minebot/shared'

interface Props {
  events: ActivityEvent[]
}

const typeColors: Record<ActivityEvent['type'], string> = {
  danger: 'var(--danger)',
  command: 'var(--command)',
  action: 'var(--success)',
  info: 'var(--text-secondary)',
}

export function ActivityFeed({ events }: Props) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: '12px',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <h2 style={{ marginBottom: '0.75rem' }}>Actividad</h2>
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: '250px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {events.length === 0 && (
          <p style={{ color: 'var(--text-secondary)' }}>Sin actividad...</p>
        )}
        {events.map((event) => (
          <div key={event.id} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
              {new Date(event.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ color: typeColors[event.type] }}>{event.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
