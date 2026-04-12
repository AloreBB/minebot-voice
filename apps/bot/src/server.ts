import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ServerToClientEvents, ClientToServerEvents } from '@minebot/shared'
import { authRouter, verifyToken } from './auth.js'
import { createBot } from './bot/index.js'
import { setupSocketBridge } from './socket/events.js'

const app = express()
const server = createServer(app)

export const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: '*' },
})

app.use(express.json())
app.use(authRouter())

// Serve frontend static files in production
const __dirname = dirname(fileURLToPath(import.meta.url))
const webDist = join(__dirname, '../../web/dist')
app.use(express.static(webDist))
app.get('*', (_req, res, next) => {
  if (_req.path.startsWith('/api')) return next()
  res.sendFile(join(webDist, 'index.html'))
})

// Socket.io auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token as string
  if (!token || !verifyToken(token)) {
    return next(new Error('Unauthorized'))
  }
  next()
})

// Wire up the socket ↔ bot event bridge
const { startBotListeners, stopBotListeners } = setupSocketBridge(io)

const PORT = Number(process.env.PORT) || 3001

server.listen(PORT, () => {
  console.log(`MineBot server running on port ${PORT}`)

  // Connect to Minecraft server
  const host = process.env.MINECRAFT_HOST ?? 'localhost'
  const port = Number(process.env.MINECRAFT_PORT) || 25565
  const username = process.env.BOT_USERNAME ?? 'MineBot'

  const bot = createBot({ host, port, username })

  // Once the bot has a physical presence in the world, start stat intervals
  bot.on('spawn', () => {
    // stopBotListeners first in case of reconnection — avoids duplicate intervals
    stopBotListeners()
    startBotListeners(bot)
  })

  bot.on('end', () => {
    stopBotListeners()
    io.emit('bot:status', 'disconnected')
  })

  bot.on('kicked', () => {
    stopBotListeners()
    io.emit('bot:status', 'disconnected')
  })
})

export { app, server }
