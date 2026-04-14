import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import type { ServerToClientEvents, ClientToServerEvents } from '@minebot/shared'
import { authRouter, verifyToken } from './auth.js'
import { connectBot } from './bot/index.js'
import { setupSocketBridge } from './socket/events.js'
import { getDb } from './db/index.js'
import { getRecentActivity, getActivityBefore } from './db/activity.js'

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : []

const app = express()
const server = createServer(app)

export const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
  },
})

app.use(helmet({
  contentSecurityPolicy: false,
}))

app.get('/api/health', (_req, res) => { res.json({ ok: true }) })
app.use(express.json({ limit: '16kb' }))

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Too many login attempts, try again in 15 minutes' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

app.use('/api/login', loginLimiter)
app.use(authRouter())

getDb() // Initialize database on startup

// Paginated activity endpoint
app.get('/api/activity', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const db = getDb()
  const limit = Math.min(Number(req.query.limit) || 50, 100)
  const before = Number(req.query.before) || 0

  const events = before > 0
    ? getActivityBefore(db, before, limit)
    : getRecentActivity(db, limit)

  res.json({ events, hasMore: events.length === limit })
})

// Serve frontend static files in production
const __dirname = dirname(fileURLToPath(import.meta.url))
const webDist = join(__dirname, '../../web/dist')
app.use(express.static(webDist))
app.use((_req, res, next) => {
  if (_req.path.startsWith('/api') || _req.path.startsWith('/socket.io')) return next()
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

  const bot = connectBot({ host, port, username })

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
