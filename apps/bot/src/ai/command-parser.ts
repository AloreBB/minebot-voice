import Anthropic from '@anthropic-ai/sdk'
import type { CommandResponse, BotAction } from '@minebot/shared'

const anthropic = new Anthropic()

export interface BotContext {
  health: number
  food: number
  position: { x: number; y: number; z: number }
  inventory: string[]
  timeOfDay: number
  isRaining: boolean
}

export const ACTION_SCHEMA = `
Available actions (respond with exactly these JSON shapes):

1. moveTo: { "action": "moveTo", "x": number, "y": number, "z": number }
2. mine: { "action": "mine", "block": string, "count": number }
   - block must be the Minecraft block ID (e.g. "diamond_ore", "stone", "oak_log")
3. digDown: { "action": "digDown", "toY": number }
   - toY is the Y coordinate to dig down to (diamond level is around -59)
4. follow: { "action": "follow", "player": string }
5. attack: { "action": "attack", "entity": string }
   - entity is the mob type (e.g. "zombie", "skeleton", "cow")
6. craft: { "action": "craft", "item": string }
   - item must be the Minecraft item ID (e.g. "crafting_table", "wooden_pickaxe", "stone_axe")
7. equipItem: { "action": "equipItem", "item": string, "destination": string }
   - destination: "hand", "off-hand", "head", "torso", "legs", "feet"
8. dropItem: { "action": "dropItem", "item": string, "count": number }
9. stop: { "action": "stop" }
10. say: { "action": "say", "message": string }
11. sleep: { "action": "sleep" }
`.trim()

const SYSTEM_PROMPT = `You are MineBot, an expert Minecraft bot that translates natural language commands into action sequences. You are resourceful, smart, and always find a way to fulfill requests.

## Rules
- Respond ONLY with a raw JSON object. No markdown, no code fences, no explanation.
- The "understood" field must be a brief Spanish sentence describing what you'll do.
- Think about prerequisites: if the user asks for stone axes, you need a crafting_table first, then planks, sticks, etc.
- Use correct Minecraft block/item IDs (snake_case): oak_log, cobblestone, stone_axe, wooden_pickaxe, crafting_table, stick, oak_planks
- When the user says "madera" they usually mean oak_log. "piedra" = cobblestone for crafting.
- For crafting tools, remember recipes: stone_axe needs 3 cobblestone + 2 sticks. wooden_pickaxe needs 3 oak_planks + 2 sticks.
- You can chain many actions. Be thorough — complete the full request in one response.
- If a command is ambiguous, make reasonable assumptions and execute.
- If the user says something casual ("hola", "que haces"), respond with a say action.

## Response format
{"understood": "<Spanish description>", "actions": [...]}
`

export function buildPrompt(command: string, ctx: BotContext): string {
  const inventoryStr =
    ctx.inventory.length > 0 ? ctx.inventory.join(', ') : 'vacío'

  const timeStr = ctx.timeOfDay >= 13000 && ctx.timeOfDay <= 23000 ? 'noche' : 'día'

  return `## Bot state
- Health: ${ctx.health}/20, Food: ${ctx.food}/20
- Position: x=${ctx.position.x}, y=${ctx.position.y}, z=${ctx.position.z}
- Time: ${timeStr}${ctx.isRaining ? ', lloviendo' : ''}
- Inventory: ${inventoryStr}

## Actions
${ACTION_SCHEMA}

## Command
${command}`
}

function extractJSON(raw: string): string {
  // Try raw first
  const trimmed = raw.trim()

  // Strip markdown code fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()

  // Find first { to last }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1)

  return trimmed
}

export function parseResponse(raw: string): CommandResponse {
  const jsonStr = extractJSON(raw)

  try {
    const parsed = JSON.parse(jsonStr) as unknown
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
    console.error('[AI] Unexpected response shape:', jsonStr.slice(0, 200))
    return {
      understood: 'Respuesta inesperada del modelo. Intenta de nuevo.',
      actions: [],
    }
  } catch (err) {
    console.error('[AI] Failed to parse JSON:', jsonStr.slice(0, 200), err)
    return {
      understood: 'No pude procesar la respuesta. Intenta de nuevo.',
      actions: [],
    }
  }
}

export async function parseCommand(
  command: string,
  ctx: BotContext,
): Promise<CommandResponse> {
  const prompt = buildPrompt(command, ctx)

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''

    console.log('[AI] Raw response:', raw.slice(0, 300))

    return parseResponse(raw)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[AI] API call failed:', msg)
    return {
      understood: `Error al contactar la IA: ${msg.slice(0, 100)}`,
      actions: [],
    }
  }
}
