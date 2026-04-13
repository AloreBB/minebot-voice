let textureMap: Record<string, string> | null = null

async function loadTextures(): Promise<Record<string, string>> {
  if (!textureMap) {
    textureMap = (await import('../generated/textures.json')).default
  }
  return textureMap
}

// Eagerly start loading on module init
const texturesReady = loadTextures()

export function getItemTexture(name: string): string | null {
  if (!textureMap) return null
  return textureMap[name] ?? null
}

export { texturesReady }
