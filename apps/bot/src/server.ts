import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ServerToClientEvents, ClientToServerEvents } from '@minebot/shared'
import { authRouter, verifyToken } from './auth.js'

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

const PORT = Number(process.env.PORT) || 3001

server.listen(PORT, () => {
  console.log(`MineBot server running on port ${PORT}`)
})

export { app, server }
