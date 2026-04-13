import type { BotStats, BotStatus } from '@minebot/shared'

interface Props {
  stats: BotStats | null
  botStatus: BotStatus
}

// Pixel heart SVG (10x9 grid)
function Heart({ filled, half }: { filled: boolean; half?: boolean }) {
  return (
    <svg width="14" height="13" viewBox="0 0 10 9" style={{ imageRendering: 'pixelated' }}>
      {/* Outline/background */}
      <path d="M1,0 L3,0 L3,1 L0,1 L0,3 L1,3 Z M6,0 L8,0 L8,1 L9,1 L9,3 L8,3 L8,1 L6,1 Z M0,3 L0,5 L1,5 L1,6 L2,6 L2,7 L3,7 L3,8 L4,8 L4,9 L5,9 L5,8 L6,8 L6,7 L7,7 L7,6 L8,6 L8,5 L9,5 L9,3 Z"
        fill={filled || half ? 'var(--mc-heart)' : 'var(--mc-heart-bg)'} />
      {half && (
        <rect x="5" y="0" width="5" height="9" fill="var(--mc-heart-bg)" />
      )}
    </svg>
  )
}

function Food({ filled, half }: { filled: boolean; half?: boolean }) {
  // Simple circle-based drumstick approximation
  return (
    <svg width="14" height="13" viewBox="0 0 10 9" style={{ imageRendering: 'pixelated' }}>
      <rect x="2" y="1" width="6" height="5" rx="2"
        fill={filled || half ? 'var(--mc-food)' : 'var(--mc-food-bg)'} />
      <rect x="4" y="6" width="2" height="3"
        fill={filled || half ? '#8B5E3C' : 'var(--mc-food-bg)'} />
      {half && <rect x="5" y="0" width="5" height="9" fill="var(--mc-food-bg)" />}
    </svg>
  )
}

function IconRow({ value, max, Icon }: { value: number; max: number; Icon: typeof Heart }) {
  const icons = []
  const totalIcons = max / 2 // 10 icons for max 20
  for (let i = 0; i < totalIcons; i++) {
    const threshold = (i + 1) * 2
    if (value >= threshold) {
      icons.push(<Icon key={i} filled={true} />)
    } else if (value >= threshold - 1) {
      icons.push(<Icon key={i} filled={false} half={true} />)
    } else {
      icons.push(<Icon key={i} filled={false} />)
    }
  }
  return <div style={{ display: 'flex', gap: '1px', flexWrap: 'wrap' }}>{icons}</div>
}

function timeLabel(timeOfDay: number): string {
  if (timeOfDay >= 0 && timeOfDay < 6000) return 'MORNING'
  if (timeOfDay >= 6000 && timeOfDay < 12000) return 'NOON'
  if (timeOfDay >= 12000 && timeOfDay < 13000) return 'SUNSET'
  return 'NIGHT'
}

const stateLabels: Record<string, { label: string; color: string }> = {
  idle: { label: 'IDLE', color: 'var(--mc-success)' },
  surviving: { label: 'COMBAT', color: 'var(--mc-danger)' },
  executing_command: { label: 'WORKING', color: 'var(--mc-diamond)' },
  maintaining: { label: 'MAINTAIN', color: 'var(--mc-warning)' },
}

export function StatsPanel({ stats, botStatus }: Props) {
  if (!stats) {
    return (
      <div className="mc-panel">
        <div className="mc-title">Status</div>
        <p style={{ fontFamily: 'var(--font-terminal)', color: 'var(--mc-text-dim)' }}>
          Bot: {botStatus}
        </p>
      </div>
    )
  }

  const stateInfo = stateLabels[stats.state] ?? { label: stats.state, color: 'var(--mc-text)' }
  const xpPct = Math.round(stats.xp.progress * 100)

  return (
    <div className="mc-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Hearts row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconRow value={stats.health} max={20} Icon={Heart} />
        <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.4rem', color: 'var(--mc-heart)' }}>
          {Math.round(stats.health)}/20
        </span>
      </div>

      {/* Food row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconRow value={stats.food} max={20} Icon={Food} />
        <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.4rem', color: 'var(--mc-food)' }}>
          {Math.round(stats.food)}/20
        </span>
      </div>

      {/* XP bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div className="mc-inset" style={{ flex: 1, height: '10px', padding: '1px' }}>
          <div style={{
            height: '100%',
            width: `${xpPct}%`,
            background: 'var(--mc-xp)',
            transition: 'width 0.3s',
            boxShadow: '0 0 4px rgba(127,255,0,0.3)',
          }} />
        </div>
        <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.35rem', color: 'var(--mc-xp)' }}>
          LV.{stats.xp.level}
        </span>
      </div>

      {/* Info row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.25rem 1rem',
        fontFamily: 'var(--font-terminal)',
        fontSize: '1rem',
        color: 'var(--mc-text-dim)',
        borderTop: '1px solid var(--mc-border-dark)',
        paddingTop: '0.4rem',
      }}>
        <span>X:{stats.position.x} Y:{stats.position.y} Z:{stats.position.z}</span>
        <span>{timeLabel(stats.timeOfDay)} {stats.isRaining ? '☁' : '☀'}</span>
        <span style={{ color: stateInfo.color }}>[{stateInfo.label}]</span>
      </div>
    </div>
  )
}
