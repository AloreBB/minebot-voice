import Anthropic from '@anthropic-ai/sdk'
import type { CommandResponse, BotAction } from '@minebot/shared'

const anthropic = new Anthropic()

export interface BotContext {
  health: number
  food: number
  position: { x: number; y: number; z: number }
  inventory: string[]
}

export const ACTION_SCHEMA = `
Available actions (respond with exactly these JSON shapes):

1. moveTo: { "action": "moveTo", "x": number, "y": number, "z": number }
2. mine: { "action": "mine", "block": string, "count": number }
   - block must be the Minecraft block ID (e.g. "diamond_ore", "stone", "oak_log")
3. digDown: { "action": "digDown", "toY": number }
   - toY is the Y coordinate to dig down to (diamond level is around -59)
4. follow: { "action": "follow", "player": string }
   - player is the Minecraft username to follow
5. attack: { "action": "attack", "entity": string }
   - entity is the mob type (e.g. "zombie", "skeleton", "cow")
6. craft: { "action": "craft", "item": string }
   - item must be the Minecraft item ID (e.g. "crafting_table", "wooden_pickaxe")
7. equipItem: { "action": "equipItem", "item": string, "destination": string }
   - destination: "hand", "off-hand", "head", "torso", "legs", "feet"
8. dropItem: { "action": "dropItem", "item": string, "count": number }
9. stop: { "action": "stop" }
10. say: { "action": "say", "message": string }
11. sleep: { "action": "sleep" }
   - Find the nearest bed and sleep in it. Use when the user says "ven a dormir", "ve a dormir", "duerme", etc.
`.trim()

export function buildPrompt(command: string, ctx: BotContext): string {
  const inventoryStr =
    ctx.inventory.length > 0 ? ctx.inventory.join(', ') : 'empty'

  return `You are a Minecraft bot assistant. The user gives you commands in natural language and you must translate them into a sequence of JSON actions.

## Current bot state
- health: ${ctx.health}
- food: ${ctx.food}
- position: x=${ctx.position.x}, y=${ctx.position.y}, z=${ctx.position.z}
- inventory: ${inventoryStr}

## Action schema
${ACTION_SCHEMA}

## Response format
Respond ONLY with valid JSON in this exact shape, no other text:
{
  "understood": "<brief Spanish description of what you will do>",
  "actions": [ ...array of action objects... ]
}

## User command
${command}`
}

export function parseResponse(raw: string): CommandResponse {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'understood' in parsed &&
      'actions' in parsed &&
      typeof (parsed as any).understood === 'string' &&
      Array.isArray((parsed as any).actions)
    ) {
      return {
        understood: (parsed as any).understood as string,
        actions: (parsed as any).actions as BotAction[],
      }
    }
    return {
      understood: 'No entendí la respuesta del modelo (formato inesperado)',
      actions: [],
    }
  } catch {
    return {
      understood: 'No entendí el comando. Por favor intenta de nuevo.',
      actions: [],
    }
  }
}

export async function parseCommand(
  command: string,
  ctx: BotContext,
): Promise<CommandResponse> {
  const prompt = buildPrompt(command, ctx)

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  const raw = textBlock?.type === 'text' ? textBlock.text : ''

  return parseResponse(raw)
}
