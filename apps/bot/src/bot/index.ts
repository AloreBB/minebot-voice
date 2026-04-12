import mineflayer, { type Bot } from 'mineflayer'
import { loadPlugins } from './plugins.js'

export interface BotConfig {
  host: string
  port: number
  username: string
}

let bot: Bot | null = null

export function getBot(): Bot | null {
  return bot
}

export function createBot(config: BotConfig): Bot {
  if (bot) {
    bot.quit()
    bot = null
  }

  console.log(`[Bot] Connecting as ${config.username} to ${config.host}:${config.port}`)

  bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    auth: 'offline',
  })

  loadPlugins(bot)

  bot.on('login', () => {
    console.log('[Bot] Logged in successfully')
  })

  bot.on('spawn', () => {
    console.log('[Bot] Spawned in world')
  })

  bot.on('death', () => {
    console.log('[Bot] Died, will respawn')
  })

  bot.on('kicked', (reason) => {
    console.log(`[Bot] Kicked: ${reason}`)
  })

  bot.on('error', (err) => {
    console.error('[Bot] Error:', err.message)
  })

  bot.on('end', (reason) => {
    console.log(`[Bot] Disconnected: ${reason}`)
    bot = null

    setTimeout(() => {
      console.log('[Bot] Attempting reconnection...')
      createBot(config)
    }, 5000)
  })

  return bot
}
