import { useRef, useEffect } from 'react'
import type { ActivityEvent } from '@minebot/shared'

interface Props {
  events: ActivityEvent[]
  onLoadMore?: () => void
  hasMore?: boolean
  loading?: boolean
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

export function ActivityFeed({ events, onLoadMore, hasMore, loading }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // IntersectionObserver to trigger loading more when sentinel is visible
  useEffect(() => {
    if (!onLoadMore || !hasMore) return

    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          onLoadMore()
        }
      },
      { root: containerRef.current, threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [onLoadMore, hasMore, loading])

  return (
    <div className="mc-panel">
      <div className="mc-title">Actividad</div>
      <div ref={containerRef} className="mc-inset" style={{
        maxHeight: '200px',
        overflowY: 'auto',
        padding: '0.4rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
      }}>
        {events.length === 0 && !loading && (
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

        {/* Sentinel element at the bottom — triggers loading more when scrolled into view */}
        {hasMore && (
          <div ref={sentinelRef} style={{ minHeight: '1px' }}>
            {loading && (
              <p style={{
                color: 'var(--mc-text-dim)',
                fontFamily: 'var(--font-terminal)',
                fontSize: '0.85rem',
                textAlign: 'center',
                padding: '0.3rem 0',
              }}>
                Cargando...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
