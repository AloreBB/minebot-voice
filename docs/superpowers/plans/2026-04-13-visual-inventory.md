# Visual Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace text-based inventory grid with Minecraft item sprites, hotbar separation, and MC-style tooltips.

**Architecture:** Install `minecraft-assets` + `node-minecraft-assets` as devDependencies, run a Node.js script at build time to generate a JSON texture map (base64-encoded PNGs), import the map in a helper module, and use it in the refactored `InventoryGrid` component.

**Tech Stack:** React 19, Vite 6, TypeScript, minecraft-assets (PrismarineJS)

---

### Task 1: Install dependencies and generate texture data

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/scripts/generate-textures.mjs`
- Create: `apps/web/src/generated/textures.json` (generated output)

- [ ] **Step 1: Install minecraft-assets and node-minecraft-assets as devDependencies**

```bash
cd /home/alore/proyectos/minecraft/apps/web && yarn add --dev minecraft-assets node-minecraft-assets
```

- [ ] **Step 2: Inspect the package structure to verify the API**

```bash
cd /home/alore/proyectos/minecraft && node -e "
const mcAssets = require('node-minecraft-assets')('1.20.2');
const names = Object.keys(mcAssets.textureContent).slice(0, 5);
console.log('Sample items:', names);
console.log('Sample texture type:', typeof mcAssets.textureContent[names[0]].texture);
console.log('Sample texture prefix:', mcAssets.textureContent[names[0]].texture.substring(0, 50));
console.log('Total textures:', Object.keys(mcAssets.textureContent).length);
console.log('Versions:', mcAssets.versions.slice(-5));
"
```

Expected: You see item names, base64 strings, and available versions. Use the output to determine the latest available version (prefer 1.21.x if available, fallback to 1.20.2). Adjust the version in the next step accordingly.

- [ ] **Step 3: Create the texture generation script**

Create `apps/web/scripts/generate-textures.mjs`:

```javascript
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Use the latest version found in Step 2 — adjust if needed
const mcAssets = (await import('node-minecraft-assets')).default('1.20.2')

const textures = {}
for (const [name, data] of Object.entries(mcAssets.textureContent)) {
  if (data.texture) {
    textures[name] = `data:image/png;base64,${data.texture}`
  }
}

const outDir = join(__dirname, '..', 'src', 'generated')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'textures.json'), JSON.stringify(textures))

console.log(`Generated ${Object.keys(textures).length} textures → src/generated/textures.json`)
```

- [ ] **Step 4: Add the generate script to package.json**

In `apps/web/package.json`, add to `"scripts"`:

```json
"generate:textures": "node scripts/generate-textures.mjs",
"prebuild": "node scripts/generate-textures.mjs"
```

- [ ] **Step 5: Run the script and verify output**

```bash
cd /home/alore/proyectos/minecraft/apps/web && yarn generate:textures
```

Expected: "Generated N textures → src/generated/textures.json" where N is 500+. Verify the file exists and contains base64 data URLs.

```bash
ls -lh src/generated/textures.json
node -e "const t = require('./src/generated/textures.json'); console.log('Keys:', Object.keys(t).length); console.log('Has oak_log:', 'oak_log' in t); console.log('Has diamond_sword:', 'diamond_sword' in t)"
```

- [ ] **Step 6: Add generated directory to .gitignore**

Add `src/generated/` to `apps/web/.gitignore` (create the file if it doesn't exist). The textures are generated from the package, not committed.

```
# Generated files
src/generated/
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/yarn.lock apps/web/scripts/generate-textures.mjs apps/web/.gitignore
git commit -m "feat(web): add minecraft-assets texture generation script"
```

---

### Task 2: Create itemTextures helper

**Files:**
- Create: `apps/web/src/utils/itemTextures.ts`

- [ ] **Step 1: Create the utils directory and helper file**

Create `apps/web/src/utils/itemTextures.ts`:

```typescript
import textures from '../generated/textures.json'

const textureMap: Record<string, string> = textures

export function getItemTexture(name: string): string | null {
  return textureMap[name] ?? null
}
```

- [ ] **Step 2: Verify TypeScript is happy with the import**

```bash
cd /home/alore/proyectos/minecraft/apps/web && npx tsc --noEmit src/utils/itemTextures.ts 2>&1 | head -20
```

If there's an error about JSON import, check that `resolveJsonModule: true` is in `tsconfig.json` (it already is). If TypeScript complains about the JSON module type, add a declaration file `src/generated/textures.d.ts`:

```typescript
declare module '../generated/textures.json' {
  const value: Record<string, string>
  export default value
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/utils/itemTextures.ts
git commit -m "feat(web): add item texture lookup helper"
```

---

### Task 3: Refactor InventoryGrid — layout, sprites, tooltip

**Files:**
- Modify: `apps/web/src/components/InventoryGrid.tsx`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Add tooltip CSS to index.css**

Add the following CSS at the end of `apps/web/src/index.css`:

```css
/* Minecraft tooltip */
.mc-tooltip {
  visibility: hidden;
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: #100010ee;
  border: 1px solid #2d0a31;
  color: var(--mc-text);
  font-family: var(--font-terminal);
  font-size: 0.85rem;
  padding: 4px 8px;
  white-space: nowrap;
  z-index: 100;
  pointer-events: none;
}

.mc-slot:hover .mc-tooltip {
  visibility: visible;
}

/* Inventory slot with item */
.mc-slot {
  position: relative;
}

.mc-slot img {
  image-rendering: pixelated;
  width: 80%;
  height: 80%;
  object-fit: contain;
}

.mc-slot-count {
  position: absolute;
  bottom: 1px;
  right: 3px;
  font-family: var(--font-pixel);
  font-size: 0.35rem;
  color: var(--mc-text);
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
  z-index: 1;
  pointer-events: none;
  line-height: 1;
}

.mc-slot-fallback {
  width: 80%;
  height: 80%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mc-panel-light);
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  color: var(--mc-text-dim);
}
```

- [ ] **Step 2: Rewrite InventoryGrid.tsx with sprites, hotbar separation, and tooltip**

Replace the entire content of `apps/web/src/components/InventoryGrid.tsx`:

```tsx
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
```

- [ ] **Step 3: Verify the build compiles without errors**

```bash
cd /home/alore/proyectos/minecraft/apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Start the dev server and verify visually**

```bash
cd /home/alore/proyectos/minecraft && yarn dev
```

Open `http://localhost:5173` in the browser. Verify:
- Inventory shows as 3 rows + gap + 1 hotbar row
- Items show their Minecraft texture sprites (pixelated)
- Count appears in bottom-right for stacked items
- Hovering shows the dark purple tooltip with item name
- Empty slots show dark background with inset border
- Items without a matching texture show the fallback letter

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/InventoryGrid.tsx apps/web/src/index.css
git commit -m "feat(web): visual inventory with MC sprites, hotbar, and tooltip"
```

---

### Task 4: Final polish and edge cases

**Files:**
- Possibly adjust: `apps/web/src/components/InventoryGrid.tsx`
- Possibly adjust: `apps/web/src/utils/itemTextures.ts`

- [ ] **Step 1: Check for name mismatches between Mineflayer and minecraft-assets**

Common mismatches to check — Mineflayer may use different names than minecraft-assets for some items. Run a quick test with the bot connected:

1. Open the dashboard, check browser console for any items rendering with the fallback letter
2. If fallback items appear, note their `name` field
3. Check if `minecraft-assets` uses a different name (e.g., `log` vs `oak_log`, `wooden_planks` vs `oak_planks`)

If mismatches exist, add a name mapping to `itemTextures.ts`:

```typescript
const NAME_ALIASES: Record<string, string> = {
  // Add any mismatches found, e.g.:
  // 'wooden_planks': 'oak_planks',
}

export function getItemTexture(name: string): string | null {
  const resolved = NAME_ALIASES[name] ?? name
  return textureMap[resolved] ?? null
}
```

- [ ] **Step 2: Commit any fixes**

```bash
git add -u
git commit -m "fix(web): handle item name mismatches in texture lookup"
```
