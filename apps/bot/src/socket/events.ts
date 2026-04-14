import { randomUUID } from 'node:crypto'
import type { Server } from 'socket.io'
import type { Bot } from 'mineflayer'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  BotStats,
  InventoryItem,
  ActivityEvent,
  BotState,
} from '@minebot/shared'
import { tick, setActiveCommand } from '../bot/state-machine.js'
import { parseCommand } from '../ai/command-parser.js'
import { executeActions, type ActivityLogger } from '../bot/actions.js'
import { runBehavior, canStartBehavior, isBehaviorRunning, stopCurrentBehavior } from '../bot/behaviors.js'
import { getBot, getBotConfig } from '../bot/index.js'
import { requestConnect, requestDisconnect } from '../bot/bot-control.js'
import { getDb } from '../db/index.js'
import { saveConversation, getRecentHistory, formatHistoryForPrompt } from '../db/history.js'
import { saveActivity } from '../db/activity.js'

type TypedIO = Server<ClientToServerEvents, ServerToClientEvents>

function makeActivityEvent(
  type: ActivityEvent['type'],
  message: string,
): ActivityEvent {
  const event: ActivityEvent = {
    id: randomUUID(),
    timestamp: Date.now(),
    type,
    message,
  }

  // Persist to database
  try {
    const db = getDb()
    saveActivity(db, { type: event.type, message: event.message, timestamp: event.timestamp })
  } catch (err) {
    console.error('[Activity] Failed to save event:', err)
  }

  return event
}

function getInventoryItems(bot: Bot): InventoryItem[] {
  return bot.inventory.items().map((item) => ({
    slot: item.slot,
    name: item.name,
    displayName: item.displayName,
    count: item.count,
  }))
}

function buildStats(bot: Bot, state: BotState): BotStats {
  const position = bot.entity.position
  return {
    health: bot.health,
    food: bot.food,
    xp: {
      level: bot.experience.level,
      progress: bot.experience.progress,
    },
    position: {
      x: Math.round(position.x * 10) / 10,
      y: Math.round(position.y * 10) / 10,
      z: Math.round(position.z * 10) / 10,
    },
    state,
    timeOfDay: bot.time.timeOfDay,
    isRaining: bot.isRaining,
  }
}

export function setupSocketBridge(
  io: TypedIO,
  wireLifecycle: (bot: Bot) => void,
): {
  startBotListeners: (bot: Bot) => void
  stopBotListeners: () => void
} {
  let statsInterval: ReturnType<typeof setInterval> | null = null
  let tickInterval: ReturnType<typeof setInterval> | null = null
  let currentState: BotState = 'idle'

  // Named handlers so we can remove them on stop
  let currentBot: Bot | null = null
  let onDeath: (() => void) | null = null
  let onSpawn: (() => void) | null = null
  let onEntityHurt: ((entity: any) => void) | null = null
  let onUpdateSlot: (() => void) | null = null

  const MAX_COMMAND_LENGTH = 500
  const COMMAND_COOLDOWN_MS = 3000
  const commandTimestamps = new Map<string, number>()

  // Wire up connection handler — runs for every client
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`)

    // Send current status immediately on connect
    const bot = getBot()
    if (bot?.entity) {
      socket.emit('bot:status', 'connected')
      socket.emit('bot:inventory', getInventoryItems(bot))
      socket.emit('bot:stats', buildStats(bot, currentState))
    } else {
      socket.emit('bot:status', 'disconnected')
    }

    socket.on('disconnect', () => {
      commandTimestamps.delete(socket.id)
      console.log(`[Socket] Client disconnected: ${socket.id}`)
    })

    // TODO(multi-bot): recibir botId del payload y enrutarlo al bot correcto.
    socket.on('bot:connect', async () => {
      try {
        const config = getBotConfig() ?? readBotConfigFromEnv()
        await requestConnect(io, getDb(), config, wireLifecycle)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Socket] bot:connect failed:', msg)
        socket.emit('bot:activity', makeActivityEvent('danger', `No se pudo conectar: ${msg}`))
      }
    })

    socket.on('bot:disconnect', async () => {
      try {
        await requestDisconnect(io, getDb())
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Socket] bot:disconnect failed:', msg)
        socket.emit('bot:activity', makeActivityEvent('danger', `No se pudo desconectar: ${msg}`))
      }
    })

    // Handle incoming voice:command from any connected client
    socket.on('voice:command', async (command) => {
      // Rate limit: one command per COMMAND_COOLDOWN_MS per client
      const now = Date.now()
      const lastCommand = commandTimestamps.get(socket.id) ?? 0
      if (now - lastCommand < COMMAND_COOLDOWN_MS) {
        const waitEvent = makeActivityEvent('info', 'Comando demasiado rápido, espera unos segundos')
        socket.emit('bot:activity', waitEvent)
        return
      }
      commandTimestamps.set(socket.id, now)

      // Validate command input
      if (!command?.text || typeof command.text !== 'string' || command.text.length > MAX_COMMAND_LENGTH) {
        const errEvent = makeActivityEvent('info', 'Comando inválido o demasiado largo')
        socket.emit('bot:activity', errEvent)
        return
      }
      const bot = getBot()

      if (!bot?.entity) {
        const errEvent = makeActivityEvent('info', 'Bot is not connected to any server')
        io.emit('bot:activity', errEvent)
        return
      }

      console.log(`[Socket] voice:command received: "${command.text}"`)

      // Interrupt any running autonomous behavior
      stopCurrentBehavior(bot)

      // Log the command to the activity feed
      const commandEvent = makeActivityEvent('command', `You: ${command.text}`)
      io.emit('bot:activity', commandEvent)

      // Mark bot as busy so state machine transitions to executing_command
      setActiveCommand(true)

      // Build the BotContext for Claude
      const position = bot.entity.position
      const ctx = {
        health: bot.health,
        food: bot.food,
        position: { x: Math.round(position.x), y: Math.round(position.y), z: Math.round(position.z) },
        inventory: bot.inventory.items().map((i) => `${i.count}x ${i.name}`),
        timeOfDay: bot.time.timeOfDay,
        isRaining: bot.isRaining,
      }

      try {
        // Load recent conversation history from DB
        const db = getDb()
        const recentRows = getRecentHistory(db, 10)
        const historyContext = formatHistoryForPrompt(recentRows)

        const memoryDir = process.env.MEMORY_DIR ?? './data/memories'

        // Call Claude with memory tool + conversation history
        const response = await parseCommand(command.text, ctx, { memoryDir }, historyContext)

        // Save this interaction to DB (non-critical — don't let DB failure break execution)
        try {
          saveConversation(db, {
            player: 'Player',
            command: command.text,
            understood: response.understood,
            actions: response.actions,
          })
        } catch (err) {
          console.error('[Socket] Failed to save conversation:', err)
        }

        // Send Claude's interpretation back to all clients
        io.emit('command:response', response)

        // Log Claude's understood message
        const understood = makeActivityEvent('info', `Understood: ${response.understood}`)
        io.emit('bot:activity', understood)

        // Execute the actions sequentially
        const log: ActivityLogger = (type, message) => {
          io.emit('bot:activity', makeActivityEvent(type, message))
        }
        await executeActions(bot, response.actions, log)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Socket] Error processing voice command:', msg)
        io.emit('bot:activity', makeActivityEvent('info', `Error: ${msg}`))
      } finally {
        // Always clear the active-command flag when done
        setActiveCommand(false)
      }
    })
  })

  function startBotListeners(bot: Bot): void {
    console.log('[Socket] Starting bot listeners and stat intervals')

    currentBot = bot

    io.emit('bot:status', 'connected')

    // Send full inventory on first connection
    io.emit('bot:inventory', getInventoryItems(bot))

    // Emit bot stats every 1 second
    statsInterval = setInterval(() => {
      if (!bot.entity) return
      io.emit('bot:stats', buildStats(bot, currentState))
    }, 1000)

    // Run the state machine tick every 2 seconds
    tickInterval = setInterval(() => {
      const prevState = currentState

      tick((newState) => {
        currentState = newState
      })

      // If state changed to a higher priority, interrupt current behavior
      if (currentState !== prevState && isBehaviorRunning()) {
        if (currentState === 'surviving' || currentState === 'executing_command') {
          stopCurrentBehavior(bot)
        }
      }

      // Run autonomous behaviors when not executing a user command
      if (currentState !== 'executing_command' && canStartBehavior()) {
        const log: ActivityLogger = (type, message) => {
          io.emit('bot:activity', makeActivityEvent(type, message))
        }
        runBehavior(currentState, bot, log)
      }
    }, 2000)

    // --- Bot lifecycle events (named so stopBotListeners can remove them) ---

    onDeath = () => {
      console.log('[Bot] death event')
      io.emit('bot:status', 'dead')
      io.emit('bot:activity', makeActivityEvent('danger', 'Bot died — will respawn'))
    }

    onSpawn = () => {
      console.log('[Bot] spawn event (after death)')
      io.emit('bot:status', 'connected')
      io.emit('bot:activity', makeActivityEvent('info', 'Bot spawned / respawned'))
      io.emit('bot:inventory', getInventoryItems(bot))
    }

    onEntityHurt = (entity: any) => {
      if (entity !== bot.entity) return
      io.emit('bot:activity', makeActivityEvent('danger', `Bot took damage (health: ${bot.health})`))

      if (bot.health <= 6) {
        io.emit('bot:activity', makeActivityEvent('danger', `Low health warning: ${bot.health}/20`))
      }
    }

    onUpdateSlot = () => {
      io.emit('bot:inventory', getInventoryItems(bot))
    }

    bot.on('death', onDeath)
    bot.on('spawn', onSpawn)
    bot.on('entityHurt', onEntityHurt)
    ;(bot.inventory as any).on('updateSlot', onUpdateSlot)
  }

  function stopBotListeners(): void {
    console.log('[Socket] Stopping bot listeners and stat intervals')

    if (statsInterval !== null) {
      clearInterval(statsInterval)
      statsInterval = null
    }

    if (tickInterval !== null) {
      clearInterval(tickInterval)
      tickInterval = null
    }

    // Remove bot event listeners to prevent duplicates on respawn
    if (currentBot) {
      if (onDeath) currentBot.removeListener('death', onDeath)
      if (onSpawn) currentBot.removeListener('spawn', onSpawn)
      if (onEntityHurt) currentBot.removeListener('entityHurt', onEntityHurt)
      if (onUpdateSlot) (currentBot.inventory as any).removeListener('updateSlot', onUpdateSlot)
    }
    onDeath = null
    onSpawn = null
    onEntityHurt = null
    onUpdateSlot = null
  }

  return { startBotListeners, stopBotListeners }
}

function readBotConfigFromEnv(): { host: string; port: number; username: string } {
  return {
    host: process.env.MINECRAFT_HOST ?? 'localhost',
    port: Number(process.env.MINECRAFT_PORT) || 25565,
    username: process.env.BOT_USERNAME ?? 'MineBot',
  }
}
