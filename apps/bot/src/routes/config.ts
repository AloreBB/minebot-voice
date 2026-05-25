import { Router } from 'express'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../db/schema.js'
import type { ServerConfig } from '../db/bot-config.js'
import { getServerConfig, setServerConfig } from '../db/bot-config.js'

type Db = BetterSQLite3Database<typeof schema>

type ValidationSuccess = { valid: true; config: ServerConfig }
type ValidationFailure = { valid: false; errors: Record<string, string> }

export function validateServerConfig(body: unknown): ValidationSuccess | ValidationFailure {
  const errors: Record<string, string> = {}
  const b = body as Record<string, unknown>

  const host = b?.host
  if (!host || typeof host !== 'string' || host.trim().length === 0) {
    errors.host = 'Required, must be a non-empty string'
  } else if (host.length > 253) {
    errors.host = 'Must be 253 characters or fewer'
  }

  const port = b?.port
  if (port === undefined || port === null || typeof port !== 'number'
    || !Number.isInteger(port) || port < 1 || port > 65535) {
    errors.port = 'Required, must be an integer between 1 and 65535'
  }

  const username = b?.username
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    errors.username = 'Required, must be a non-empty string'
  } else if (username.length > 16) {
    errors.username = 'Must be 16 characters or fewer'
  }

  const version = b?.version
  let parsedVersion: string | undefined
  if (version !== undefined && version !== null && version !== '') {
    if (typeof version !== 'string' || !/^\d+\.\d+(\.\d+)?$/.test(version)) {
      errors.version = 'Must match format X.Y or X.Y.Z (e.g. 1.20.4)'
    } else {
      parsedVersion = version
    }
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors }

  const config: ServerConfig = {
    host: (host as string).trim(),
    port: port as number,
    username: (username as string).trim(),
    ...(parsedVersion ? { version: parsedVersion } : {}),
  }
  return { valid: true, config }
}

export function createConfigRouter(db: Db): Router {
  const router = Router()

  router.get('/api/config', (_req, res) => {
    const config = getServerConfig(db)
    if (!config) {
      res.json({
        host: process.env.MINECRAFT_HOST ?? 'localhost',
        port: Number(process.env.MINECRAFT_PORT) || 25565,
        username: process.env.BOT_USERNAME ?? 'MineBot',
      })
      return
    }
    res.json(config)
  })

  router.put('/api/config', (req, res) => {
    const result = validateServerConfig(req.body)
    if (!result.valid) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid config', details: result.errors },
      })
      return
    }
    setServerConfig(db, result.config)
    res.json({ ok: true })
  })

  return router
}