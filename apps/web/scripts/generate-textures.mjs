import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const mcAssets = (await import('minecraft-assets')).default('1.21.8')

const textures = {}
for (const [name, data] of Object.entries(mcAssets.textureContent)) {
  if (data && data.texture) {
    textures[name] = data.texture
  }
}

const outDir = join(__dirname, '..', 'src', 'generated')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'textures.json'), JSON.stringify(textures))

console.log(`Generated ${Object.keys(textures).length} textures → src/generated/textures.json`)
