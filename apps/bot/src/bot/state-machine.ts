import type { Bot } from 'mineflayer'
import type { BotState } from '@minebot/shared'
import { getBot } from './index.js'

const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
  'witch', 'pillager', 'vindicator', 'drowned', 'phantom',
  'blaze', 'ghast', 'wither_skeleton', 'hoglin', 'piglin_brute',
])

export interface EvalContext {
  health: number
  food: number
  nearestHostileDistance: number
  hasActiveCommand: boolean
  isNight: boolean
  isOutdoors: boolean
  inventoryFull: boolean
}

export function evaluateState(ctx: EvalContext): BotState {
  // Priority 1: Survive
  if (ctx.health < 6 || ctx.nearestHostileDistance < 5) {
    return 'surviving'
  }

  // Priority 2: User command
  if (ctx.hasActiveCommand) {
    return 'executing_command'
  }

  // Priority 3: Maintenance
  if ((ctx.isNight && ctx.isOutdoors) || ctx.inventoryFull) {
    return 'maintaining'
  }

  // Priority 4: Idle
  return 'idle'
}

export function buildContext(bot: Bot, hasActiveCommand: boolean): EvalContext {
  let nearestHostileDistance = Infinity
  for (const entity of Object.values(bot.entities)) {
    if (entity === bot.entity) continue
    if (entity.name && HOSTILE_MOBS.has(entity.name)) {
      const dist = bot.entity.position.distanceTo(entity.position)
      if (dist < nearestHostileDistance) {
        nearestHostileDistance = dist
      }
    }
  }

  const timeOfDay = bot.time.timeOfDay
  const isNight = timeOfDay >= 13000 && timeOfDay <= 23000

  const blockAbove = bot.blockAt(bot.entity.position.offset(0, 2, 0))
  const isOutdoors = !blockAbove || blockAbove.name === 'air'

  const inventoryFull = bot.inventory.items().length >= 36

  return {
    health: bot.health,
    food: bot.food,
    nearestHostileDistance,
    hasActiveCommand,
    isNight,
    isOutdoors,
    inventoryFull,
  }
}

let activeCommand = false

export function setActiveCommand(active: boolean): void {
  activeCommand = active
}

export function hasActiveCommand(): boolean {
  return activeCommand
}

export function tick(onStateChange: (state: BotState) => void): void {
  const bot = getBot()
  if (!bot?.entity) return

  const ctx = buildContext(bot, activeCommand)
  const state = evaluateState(ctx)
  onStateChange(state)
}
