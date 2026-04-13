import type { Bot } from 'mineflayer'
import type { BotState } from '@minebot/shared'
import pathfinderPkg from 'mineflayer-pathfinder'

const { goals } = pathfinderPkg
const { GoalXZ, GoalNear, GoalInvert, GoalFollow } = goals

export type ActivityLogger = (
  type: 'danger' | 'command' | 'action' | 'info',
  message: string,
) => void

const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
  'witch', 'pillager', 'vindicator', 'drowned', 'phantom',
])

const JUNK_ITEMS = new Set([
  'dirt', 'cobblestone', 'gravel', 'sand', 'cobbled_deepslate',
  'diorite', 'granite', 'andesite', 'tuff', 'netherrack',
])

const GATHERABLE_LOGS = [
  'oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'jungle_log', 'acacia_log',
]

let running = false
let lastBehaviorTime = 0

const BEHAVIOR_COOLDOWN = 8_000 // 8s between behavior attempts

export function isBehaviorRunning(): boolean {
  return running
}

export function canStartBehavior(): boolean {
  return !running && Date.now() - lastBehaviorTime > BEHAVIOR_COOLDOWN
}

export function stopCurrentBehavior(bot: Bot): void {
  try {
    bot.pathfinder.stop()
    ;(bot as any).pvp.stop()
  } catch { /* noop */ }
}

// --- IDLE BEHAVIORS ---

async function wander(bot: Bot, log: ActivityLogger): Promise<void> {
  const pos = bot.entity.position
  const angle = Math.random() * Math.PI * 2
  const dist = 15 + Math.random() * 35
  const x = pos.x + Math.cos(angle) * dist
  const z = pos.z + Math.sin(angle) * dist
  log('action', `Exploring area (${Math.round(x)}, ${Math.round(z)})`)
  await bot.pathfinder.goto(new GoalXZ(x, z))
}

async function gatherNearbyWood(bot: Bot, log: ActivityLogger): Promise<boolean> {
  for (const logName of GATHERABLE_LOGS) {
    const blockType = bot.registry.blocksByName[logName]
    if (!blockType) continue
    const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 32, count: 1 })
    if (blocks.length === 0) continue
    const block = bot.blockAt(blocks[0])
    if (!block) continue
    log('action', `Gathering ${logName}`)
    await (bot as any).collectBlock.collect(block)
    return true
  }
  return false
}

async function mineNearbyStone(bot: Bot, log: ActivityLogger): Promise<boolean> {
  const hasPickaxe = bot.inventory.items().some((i) =>
    i.name.includes('pickaxe'),
  )
  if (!hasPickaxe) return false

  const targets = ['coal_ore', 'iron_ore', 'copper_ore', 'stone']
  for (const blockName of targets) {
    const blockType = bot.registry.blocksByName[blockName]
    if (!blockType) continue
    const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 32, count: 1 })
    if (blocks.length === 0) continue
    const block = bot.blockAt(blocks[0])
    if (!block) continue
    log('action', `Mining ${blockName}`)
    await (bot as any).collectBlock.collect(block)
    return true
  }
  return false
}

async function lookAround(bot: Bot): Promise<void> {
  const yaw = Math.random() * Math.PI * 2
  const pitch = (Math.random() - 0.5) * 0.6
  await bot.look(yaw, pitch, false)
}

async function runIdleBehavior(bot: Bot, log: ActivityLogger): Promise<void> {
  const roll = Math.random()

  if (roll < 0.35) {
    // 35%: try to gather wood
    const gathered = await gatherNearbyWood(bot, log)
    if (!gathered) await wander(bot, log)
  } else if (roll < 0.55) {
    // 20%: try to mine stone/ore
    const mined = await mineNearbyStone(bot, log)
    if (!mined) await wander(bot, log)
  } else if (roll < 0.85) {
    // 30%: wander
    await wander(bot, log)
  } else {
    // 15%: look around
    await lookAround(bot)
  }
}

// --- SURVIVING BEHAVIORS ---

async function runSurvivingBehavior(bot: Bot, log: ActivityLogger): Promise<void> {
  const nearestHostile = bot.nearestEntity((e) =>
    e.name != null && HOSTILE_MOBS.has(e.name),
  )

  if (!nearestHostile) return

  const dist = bot.entity.position.distanceTo(nearestHostile.position)

  // If low health or it's a creeper, flee
  if (bot.health < 8 || nearestHostile.name === 'creeper') {
    log('danger', `Fleeing from ${nearestHostile.name} (health: ${bot.health})`)
    const fleeGoal = new GoalInvert(new GoalFollow(nearestHostile, 5))
    bot.pathfinder.setGoal(fleeGoal, true)

    // Flee for a few seconds then stop
    await new Promise((resolve) => setTimeout(resolve, 4000))
    bot.pathfinder.stop()
    return
  }

  // Otherwise, fight
  if (dist < 16) {
    log('action', `Fighting ${nearestHostile.name}`)
    ;(bot as any).pvp.attack(nearestHostile)

    // Wait for combat to finish or timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        ;(bot as any).pvp.stop()
        resolve()
      }, 10000)

      ;(bot as any).pvp.once('stoppedAttacking', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }
}

// --- MAINTAINING BEHAVIORS ---

async function runMaintainingBehavior(bot: Bot, log: ActivityLogger): Promise<void> {
  const inventoryFull = bot.inventory.items().length >= 36

  if (inventoryFull) {
    // Drop junk items
    for (const item of bot.inventory.items()) {
      if (JUNK_ITEMS.has(item.name) && item.count > 16) {
        log('action', `Dropping excess ${item.name}`)
        await bot.toss(item.type, null, item.count - 16)
      }
    }
    return
  }

  // Night + outdoors: just stay alert and look around
  log('info', 'Staying alert during the night')
  await lookAround(bot)
}

// --- MAIN BEHAVIOR RUNNER ---

export async function runBehavior(
  state: BotState,
  bot: Bot,
  log: ActivityLogger,
): Promise<void> {
  if (running) return
  running = true
  lastBehaviorTime = Date.now()

  try {
    switch (state) {
      case 'idle':
        await runIdleBehavior(bot, log)
        break
      case 'surviving':
        await runSurvivingBehavior(bot, log)
        break
      case 'maintaining':
        await runMaintainingBehavior(bot, log)
        break
      case 'executing_command':
        // Handled by voice command system, don't interfere
        break
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Behaviors] Error in ${state}:`, msg)
  } finally {
    running = false
  }
}
