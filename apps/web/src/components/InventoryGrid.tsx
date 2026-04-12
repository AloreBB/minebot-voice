import type { InventoryItem } from '@minebot/shared'

interface Props {
  items: InventoryItem[]
}

export function InventoryGrid({ items }: Props) {
  const slots = new Array(36).fill(null) as (InventoryItem | null)[]
  for (const item of items) {
    const idx = item.slot - 9
    if (idx >= 0 && idx < 36) {
      slots[idx] = item
    }
  }

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>Inventario</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '4px' }}>
        {slots.map((item, i) => (
          <div
            key={i}
            title={item ? `${item.displayName} x${item.count}` : 'Vacio'}
            style={{
              aspectRatio: '1',
              background: item ? 'var(--bg-card)' : 'var(--bg-primary)',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.65rem',
              padding: '2px',
              overflow: 'hidden',
              border: item ? '1px solid var(--accent)' : '1px solid transparent',
            }}
          >
            {item && (
              <>
                <span style={{ textAlign: 'center', lineHeight: 1.1 }}>
                  {item.name.replace(/_/g, ' ').slice(0, 10)}
                </span>
                <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{item.count}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
