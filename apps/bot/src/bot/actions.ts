import type { Bot } from 'mineflayer'
import type { BotAction } from '@minebot/shared'
import pathfinderPkg from 'mineflayer-pathfinder'

const { goals } = pathfinderPkg
const { GoalNear, GoalFollow, GoalY } = goals

export type ActivityLogger = (
  type: 'danger' | 'command' | 'action' | 'info',
  message: string,
) => void

export async function executeAction(
  bot: Bot,
  action: BotAction,
  log: ActivityLogger,
): Promise<void> {
  switch (action.action) {
    case 'moveTo': {
      log('action', `Moving to (${action.x}, ${action.y}, ${action.z})`)
      const goal = new GoalNear(action.x, action.y, action.z, 1)
      await bot.pathfinder.goto(goal)
      log('info', `Arrived at (${action.x}, ${action.y}, ${action.z})`)
      break
    }

    case 'mine': {
      log('action', `Mining ${action.count}x ${action.block}`)
      const mcData = (bot as any).registry
      const blockType = bot.registry.blocksByName[action.block]
      if (!blockType) {
        log('info', `Unknown block: ${action.block}`)
        break
      }
      let collected = 0
      while (collected < action.count) {
        const blocks = bot.findBlocks({
          matching: blockType.id,
          maxDistance: 64,
          count: action.count - collected,
        })
        if (blocks.length === 0) {
          log('info', `No more ${action.block} found nearby`)
          break
        }
        for (const pos of blocks) {
          if (collected >= action.count) break
          const block = bot.blockAt(pos)
          if (!block) continue
          try {
            await (bot as any).collectBlock.collect(block)
            collected++
            log('info', `Collected ${action.block} (${collected}/${action.count})`)
          } catch (err: any) {
            log('info', `Could not collect ${action.block}: ${err?.message ?? String(err)}`)
          }
        }
        if (blocks.length < action.count - collected) break
      }
      break
    }

    case 'digDown': {
      log('action', `Digging down to Y=${action.toY}`)
      const goal = new GoalY(action.toY)
      await bot.pathfinder.goto(goal)
      log('info', `Reached Y=${action.toY}`)
      break
    }

    case 'follow': {
      log('action', `Following player: ${action.player}`)
      const entity = bot.players[action.player]?.entity
      if (!entity) {
        log('info', `Player ${action.player} not found nearby`)
        break
      }
      const goal = new GoalFollow(entity, 3)
      // GoalFollow is dynamic — setGoal with dynamic=true
      bot.pathfinder.setGoal(goal, true)
      log('info', `Now following ${action.player}`)
      break
    }

    case 'attack': {
      log('action', `Attacking entity: ${action.entity}`)
      const target = Object.values(bot.entities).find(
        (e) => e !== bot.entity && (e.name === action.entity || e.displayName === action.entity),
      )
      if (!target) {
        log('info', `Entity ${action.entity} not found`)
        break
      }
      ;(bot as any).pvp.attack(target)
      log('info', `Attacking ${action.entity}`)
      break
    }

    case 'craft': {
      log('action', `Crafting: ${action.item}`)
      const itemType = bot.registry.itemsByName[action.item]
      if (!itemType) {
        log('info', `Unknown item: ${action.item}`)
        break
      }
      const recipes = bot.recipesFor(itemType.id, null, 1, null)
      if (recipes.length === 0) {
        log('info', `No recipe found for ${action.item}`)
        break
      }
      await bot.craft(recipes[0], 1, undefined)
      log('info', `Crafted ${action.item}`)
      break
    }

    case 'equipItem': {
      log('action', `Equipping ${action.item} to ${action.destination}`)
      const item = bot.inventory.items().find((i) => i.name === action.item)
      if (!item) {
        log('info', `Item ${action.item} not in inventory`)
        break
      }
      await bot.equip(item, action.destination as Parameters<Bot['equip']>[1])
      log('info', `Equipped ${action.item} to ${action.destination}`)
      break
    }

    case 'dropItem': {
      log('action', `Dropping ${action.count}x ${action.item}`)
      const item = bot.inventory.items().find((i) => i.name === action.item)
      if (!item) {
        log('info', `Item ${action.item} not in inventory`)
        break
      }
      await bot.toss(item.type, null, action.count)
      log('info', `Dropped ${action.count}x ${action.item}`)
      break
    }

    case 'stop': {
      log('action', 'Stopping all activities')
      bot.pathfinder.stop()
      ;(bot as any).pvp.stop()
      log('info', 'Stopped')
      break
    }

    case 'say': {
      log('command', `Say: ${action.message}`)
      bot.chat(action.message)
      break
    }

    default: {
      const exhaustive: never = action
      log('info', `Unknown action: ${(exhaustive as any).action}`)
    }
  }
}

export async function executeActions(
  bot: Bot,
  actions: BotAction[],
  log: ActivityLogger,
): Promise<void> {
  for (const action of actions) {
    await executeAction(bot, action, log)
  }
}
