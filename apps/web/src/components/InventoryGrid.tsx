import type { InventoryItem } from '@minebot/shared'
import { getItemTexture } from '../utils/itemTextures'

interface Props {
  items: InventoryItem[]
}

function InventorySlot({ item }: { item: InventoryItem | null }) {
  if (!item) {
    return (
      <div className="mc-inset mc-slot" style={{ aspectRatio: '1' }} />
    )
  }

  const texture = getItemTexture(item.name)

  return (
    <div
      className="mc-inset mc-slot"
      style={{
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {texture ? (
        <img src={texture} alt={item.displayName} draggable={false} />
      ) : (
        <div className="mc-slot-fallback">
          {item.displayName.charAt(0)}
        </div>
      )}
      {item.count > 1 && (
        <span className="mc-slot-count">{item.count}</span>
      )}
      <div className="mc-tooltip">{item.displayName}</div>
    </div>
  )
}

export function InventoryGrid({ items }: Props) {
  // Main inventory: slots 9-35 (3 rows of 9)
  const mainSlots = Array.from({ length: 27 }, (_, i) => {
    const slot = i + 9
    return items.find((item) => item.slot === slot) ?? null
  })

  // Hotbar: slots 0-8
  const hotbarSlots = Array.from({ length: 9 }, (_, i) => {
    return items.find((item) => item.slot === i) ?? null
  })

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(9, 1fr)',
    gap: '2px',
  }

  return (
    <div className="mc-panel">
      <div className="mc-title">Inventario</div>
      <div style={gridStyle}>
        {mainSlots.map((item, i) => (
          <InventorySlot key={`main-${i}`} item={item} />
        ))}
      </div>
      <div style={{ height: '8px' }} />
      <div style={gridStyle}>
        {hotbarSlots.map((item, i) => (
          <InventorySlot key={`hotbar-${i}`} item={item} />
        ))}
      </div>
    </div>
  )
}
