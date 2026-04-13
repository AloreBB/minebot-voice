import type { InventoryItem } from '@minebot/shared'

interface Props {
  items: InventoryItem[]
}

export function InventoryGrid({ items }: Props) {
  const slots = Array.from({ length: 36 }, (_, i) => {
    return items.find((item) => item.slot - 9 === i) ?? null
  })

  return (
    <div className="mc-panel">
      <div className="mc-title">Inventario</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(9, 1fr)',
        gap: '2px',
      }}>
        {slots.map((item, i) => (
          <div
            key={i}
            className="mc-inset"
            style={{
              aspectRatio: '1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              fontSize: '0.65rem',
              fontFamily: 'var(--font-terminal)',
              color: item ? 'var(--mc-text)' : 'transparent',
              cursor: item ? 'default' : 'default',
              padding: '2px',
              overflow: 'hidden',
            }}
            title={item ? `${item.displayName} x${item.count}` : ''}
          >
            {item && (
              <>
                <span style={{
                  fontSize: '0.55rem',
                  textAlign: 'center',
                  lineHeight: 1.1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  wordBreak: 'break-all',
                  maxHeight: '100%',
                }}>
                  {item.displayName.split(' ').pop()}
                </span>
                {item.count > 1 && (
                  <span style={{
                    position: 'absolute',
                    bottom: '1px',
                    right: '3px',
                    fontFamily: 'var(--font-pixel)',
                    fontSize: '0.3rem',
                    color: 'var(--mc-text)',
                    textShadow: '1px 1px 0 #000',
                  }}>
                    {item.count}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
