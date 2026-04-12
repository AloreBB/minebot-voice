import type { BotStats, BotStatus } from '@minebot/shared'

interface Props {
  stats: BotStats | null
  botStatus: BotStatus
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderRadius: '4px',
      height: '20px',
      flex: 1,
      overflow: 'hidden',
    }}>
      <div style={{
        background: color,
        height: '100%',
        width: `${pct}%`,
        transition: 'width 0.3s',
      }} />
    </div>
  )
}

function timeLabel(timeOfDay: number): string {
  if (timeOfDay >= 0 && timeOfDay < 6000) return 'Manana'
  if (timeOfDay >= 6000 && timeOfDay < 12000) return 'Tarde'
  if (timeOfDay >= 12000 && timeOfDay < 13000) return 'Atardecer'
  return 'Noche'
}

export function StatsPanel({ stats, botStatus }: Props) {
  if (!stats) {
    return (
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Stats</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Bot: {botStatus}</p>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>Stats</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '24px' }}>HP</span>
          <Bar value={stats.health} max={20} color="var(--danger)" />
          <span style={{ width: '50px', textAlign: 'right' }}>{stats.health}/20</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '24px' }}>FD</span>
          <Bar value={stats.food} max={20} color="var(--warning)" />
          <span style={{ width: '50px', textAlign: 'right' }}>{stats.food}/20</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
          <span>XP: Lvl {stats.xp.level}</span>
          <span>X:{stats.position.x} Y:{stats.position.y} Z:{stats.position.z}</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)' }}>
          <span>{timeLabel(stats.timeOfDay)}</span>
          {stats.isRaining && <span>Lluvia</span>}
          <span>Estado: {stats.state}</span>
        </div>
      </div>
    </div>
  )
}
