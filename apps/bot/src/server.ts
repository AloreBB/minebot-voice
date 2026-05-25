import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import type { ServerToClientEvents, ClientToServerEvents } from '@minebot/shared'
import { authRouter, verifyToken } from './auth.js'
import { createAIProvidersRouter } from './routes/ai-providers.js'
import { connectBot, setLifecycleWirer } from './bot/index.js'
import { setupSocketBridge } from './socket/events.js'
import { getDb } from './db/index.js'
import { getRecentActivity, getActivityBefore } from './db/activity.js'
import { getDesiredState, getServerConfig } from './db/bot-config.js'
import { createConfigRouter } from './routes/config.js'

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : []

if (!process.env.ENCRYPTION_MASTER_KEY) {
  console.error(
    'FATAL: ENCRYPTION_MASTER_KEY is required.\n' +
    'Generate one with: openssl rand -hex 32\n' +
    'Then add ENCRYPTION_MASTER_KEY=<value> to your .env file.'
  )
  process.exit(1)
}

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

// Config routes — require Bearer token
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/config')) { next(); return }
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})

getDb() // Initialize database on startup
app.use(createConfigRouter(getDb()))

// AI providers routes — require Bearer token
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/ai-providers')) { next(); return }
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})
app.use(createAIProvidersRouter(getDb()))

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
const { startBotListeners, stopBotListeners } = setupSocketBridge(io, wireBotLifecycleBroadcasts)

// Auto-reconnect creates a fresh bot bypassing requestConnect; register the
// wirer so that path re-attaches the spawn/end/kicked broadcasters too.
setLifecycleWirer(wireBotLifecycleBroadcasts)

const PORT = Number(process.env.PORT) || 3001

function wireBotLifecycleBroadcasts(bot: ReturnType<typeof connectBot>): void {
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
}

server.listen(PORT, () => {
  console.log(`MineBot server running on port ${PORT}`)

  const db = getDb()
  const dbConfig = getServerConfig(db)

  // No DB config and no explicit env var = fresh deployment; wait for user to configure via dashboard
  if (!dbConfig && !process.env.MINECRAFT_HOST) {
    console.log('[Bot] No server config found; waiting for user to configure via dashboard')
    io.emit('bot:status', 'disconnected')
    return
  }

  const config = dbConfig ?? {
    host: process.env.MINECRAFT_HOST!,
    port: Number(process.env.MINECRAFT_PORT) || 25565,
    username: process.env.BOT_USERNAME ?? 'MineBot',
  }

  const desired = getDesiredState(db)
  if (desired === 'disconnected') {
    console.log('[Bot] desiredState=disconnected at startup; waiting for user action')
    io.emit('bot:status', 'disconnected')
    return
  }

  const bot = connectBot(config)
  wireBotLifecycleBroadcasts(bot)
})

export { app, server }
