# Visual Inventory — Minecraft-Style Item Sprites

**Date:** 2026-04-13
**Status:** Approved

## Overview

Replace the text-based inventory grid with visual Minecraft item sprites. Each slot shows the actual item texture (block/tool/material) as it appears in Minecraft, with stack count overlay and a Minecraft-styled tooltip on hover.

## Requirements

1. **Item sprites**: Each inventory slot displays the item's Minecraft texture (PNG) instead of text
2. **Tooltip on hover**: Minecraft-style tooltip (dark purple background) showing the item's `displayName`
3. **Stack count**: Number in bottom-right corner when count > 1, with black text-shadow
4. **Hotbar separation**: Visual gap between main inventory (3 rows, slots 9-35) and hotbar (1 row, slots 0-8)
5. **Bundled textures**: Textures come from the `minecraft-assets` npm package (no external API dependency)
6. **Pixelated rendering**: All textures use `image-rendering: pixelated` to preserve pixel-art aesthetic

## Texture Source

**Package:** `minecraft-assets` + `node-minecraft-assets` (both by PrismarineJS — same org as Mineflayer)

- Item names from Mineflayer (`oak_log`, `diamond_sword`) map directly to texture names in the package
- API: `textureContent[name].texture` returns base64 PNG data
- Supports MC versions up to 1.21.8; use latest available version
- Fallback for unknown items: gray square with first character of item name

## Layout

```
┌─────────────────────────────────┐
│          Inventario             │
│                                 │
│  [slot][slot][slot]...[slot]    │  ← Row 1: slots 9-17
│  [slot][slot][slot]...[slot]    │  ← Row 2: slots 18-26
│  [slot][slot][slot]...[slot]    │  ← Row 3: slots 27-35
│                                 │  ← visual gap (~8px)
│  [slot][slot][slot]...[slot]    │  ← Hotbar: slots 0-8
└─────────────────────────────────┘
```

- Grid: `repeat(9, 1fr)` columns
- Main inventory: 27 slots (3 rows × 9)
- Hotbar: 9 slots (1 row), separated by a larger gap
- Each slot: square (`aspect-ratio: 1`), `mc-inset` styling (existing)

## Slot Rendering

### With item
- **Image**: `<img>` with base64 src from `minecraft-assets`, fills ~80% of slot
- **Count badge**: absolute-positioned bottom-right, `Press Start 2P` font, `text-shadow: 2px 2px 0 #000`, only shown when count > 1
- **Pixelated**: `image-rendering: pixelated` on the img element

### Empty slot
- Dark background with inset border (existing `mc-inset` class)
- No content

### Fallback (texture not found)
- Gray square with first character of `displayName` centered
- Same `mc-inset` styling

## Tooltip

CSS-only tooltip (no library), appears on hover:

- **Background**: `#100010` with `1px solid #2d0a31` border
- **Text**: `displayName` in white, `VT323` font
- **Position**: above the slot, centered horizontally
- **Padding**: `4px 8px`
- **Z-index**: high enough to overlay other slots
- **No arrow** (matches MC simplicity)

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `apps/web/package.json` | modify | Add `minecraft-assets` and `node-minecraft-assets` dependencies |
| `apps/web/src/utils/itemTextures.ts` | create | Helper to load textures by item name with caching and fallback |
| `apps/web/src/components/InventoryGrid.tsx` | modify | Replace text with sprites, add hotbar separation, add tooltip |
| `apps/web/src/index.css` | modify | Add tooltip styles and inventory layout adjustments |

## Data Flow

No backend changes. The flow remains:

1. `useSocket` hook receives `bot:inventory` event → `InventoryItem[]`
2. `InventoryGrid` receives items as prop
3. For each item, `getItemTexture(item.name)` returns base64 texture string
4. Component renders `<img src="data:image/png;base64,..." />` + count overlay

## Out of Scope

- Armor slots / off-hand slot visualization
- Item enchantment glint effect
- Drag-and-drop inventory management
- Item durability bar
- Crafting grid
