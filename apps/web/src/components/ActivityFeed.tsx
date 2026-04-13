import type { ActivityEvent } from '@minebot/shared'

interface Props {
  events: ActivityEvent[]
}

const typeColors: Record<ActivityEvent['type'], string> = {
  danger: 'var(--mc-danger)',
  command: 'var(--mc-diamond)',
  action: 'var(--mc-success)',
  info: 'var(--mc-info)',
}

const typePrefix: Record<ActivityEvent['type'], string> = {
  danger: '⚠',
  command: '>',
  action: '►',
  info: '·',
}

export function ActivityFeed({ events }: Props) {
  return (
    <div className="mc-panel">
      <div className="mc-title">Actividad</div>
      <div className="mc-inset" style={{
        maxHeight: '200px',
        overflowY: 'auto',
        padding: '0.4rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
      }}>
        {events.length === 0 && (
          <p style={{ color: 'var(--mc-text-dim)', fontFamily: 'var(--font-terminal)' }}>
            Sin actividad...
          </p>
        )}
        {events.map((event) => (
          <div key={event.id} style={{
            display: 'flex',
            gap: '0.4rem',
            fontFamily: 'var(--font-terminal)',
            fontSize: '0.95rem',
            lineHeight: 1.3,
          }}>
            <span style={{ color: 'var(--mc-text-dim)', flexShrink: 0, fontSize: '0.8rem' }}>
              {new Date(event.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ color: typeColors[event.type] }}>
              {typePrefix[event.type]} {event.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
