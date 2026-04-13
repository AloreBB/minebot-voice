import textures from '../generated/textures.json'

const textureMap: Record<string, string> = textures

export function getItemTexture(name: string): string | null {
  return textureMap[name] ?? null
}
