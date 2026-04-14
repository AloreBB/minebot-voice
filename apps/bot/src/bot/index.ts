import mineflayer, { type Bot } from 'mineflayer'
import { loadPlugins } from './plugins.js'

export interface BotConfig {
  host: string
  port: number
  username: string
}

// TODO(multi-bot): reemplazar por un mapa indexado por botId.
let bot: Bot | null = null
let savedConfig: BotConfig | null = null
let manualDisconnect = false

const RESISTANCE_APPLY_DELAY_MS = 1500
const AUTO_RECONNECT_DELAY_MS = 5000

export function getBot(): Bot | null {
  return bot
}

export function getBotConfig(): BotConfig | null {
  return savedConfig
}

export function connectBot(config: BotConfig): Bot {
  if (bot) {
    manualDisconnect = true
    bot.quit()
    bot = null
  }

  console.log(`[Bot] Connecting as ${config.username} to ${config.host}:${config.port}`)

  savedConfig = config
  manualDisconnect = false

  bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    auth: 'offline',
  })

  loadPlugins(bot)
  attachLifecycleLogs(bot)
  attachReconnectHandler(bot)

  return bot
}

export function disconnectBot(): void {
  if (!bot) return

  console.log('[Bot] Manual disconnect requested')
  manualDisconnect = true
  bot.quit()
  bot = null
}

function attachLifecycleLogs(currentBot: Bot): void {
  currentBot.on('login', () => {
    console.log('[Bot] Logged in successfully')
  })

  currentBot.on('spawn', () => {
    console.log('[Bot] Spawned in world')
    setTimeout(() => applyResistanceEffect(currentBot), RESISTANCE_APPLY_DELAY_MS)
  })

  currentBot.on('death', () => {
    console.log('[Bot] Died, will respawn')
  })

  currentBot.on('kicked', (reason) => {
    console.log(`[Bot] Kicked: ${reason}`)
  })

  currentBot.on('error', (err) => {
    console.error('[Bot] Error:', err.message)
  })
}

function attachReconnectHandler(currentBot: Bot): void {
  currentBot.on('end', (reason) => {
    console.log(`[Bot] Disconnected: ${reason}`)
    bot = null

    if (manualDisconnect) {
      console.log('[Bot] Manual disconnect — skipping auto-reconnect')
      return
    }

    if (!savedConfig) {
      console.log('[Bot] No saved config — skipping auto-reconnect')
      return
    }

    console.log(`[Bot] Auto-reconnecting in ${AUTO_RECONNECT_DELAY_MS}ms...`)
    setTimeout(() => connectBot(savedConfig!), AUTO_RECONNECT_DELAY_MS)
  })
}

function applyResistanceEffect(currentBot: Bot): void {
  try {
    currentBot.chat('/effect give @s minecraft:resistance infinite 255 true')
    console.log('[Bot] Applied resistance immunity')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Bot] Could not apply resistance effect:', msg)
  }
}
