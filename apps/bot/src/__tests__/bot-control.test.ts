import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema.js'
import { getDesiredState, setDesiredState } from '../db/bot-config.js'

const connectBotMock = vi.fn()
const disconnectBotMock = vi.fn()
const getBotMock = vi.fn()

vi.mock('../bot/index.js', () => ({
  connectBot: (...args: unknown[]) => connectBotMock(...args),
  disconnectBot: () => disconnectBotMock(),
  getBot: () => getBotMock(),
  getBotConfig: () => null,
}))

const { requestConnect, requestDisconnect } = await import('../bot/bot-control.js')

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE bot_config (
      id INTEGER PRIMARY KEY,
      desired_state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  return drizzle(sqlite, { schema })
}

function makeFakeIo() {
  return { emit: vi.fn() }
}

describe('bot-control', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    connectBotMock.mockReset()
    disconnectBotMock.mockReset()
    getBotMock.mockReset()
  })

  describe('requestConnect', () => {
    it('sets desiredState to "connected" and calls connectBot', async () => {
      setDesiredState(db, 'disconnected')
      const io = makeFakeIo()
      const config = { host: 'localhost', port: 25565, username: 'TestBot' }

      await requestConnect(io as any, db, config)

      expect(getDesiredState(db)).toBe('connected')
      expect(connectBotMock).toHaveBeenCalledWith(config)
    })

    it('emits connecting status during transition', async () => {
      setDesiredState(db, 'disconnected')
      const io = makeFakeIo()

      await requestConnect(io as any, db, { host: 'localhost', port: 25565, username: 'TestBot' })

      expect(io.emit).toHaveBeenCalledWith('bot:status', 'connecting')
    })

    it('is a no-op when already connected', async () => {
      setDesiredState(db, 'connected')
      getBotMock.mockReturnValue({ entity: {} })
      const io = makeFakeIo()

      await requestConnect(io as any, db, { host: 'localhost', port: 25565, username: 'TestBot' })

      expect(connectBotMock).not.toHaveBeenCalled()
    })

    it('invokes the wireLifecycle callback with the new bot', async () => {
      setDesiredState(db, 'disconnected')
      const fakeBot = { on: vi.fn() }
      connectBotMock.mockReturnValue(fakeBot)
      const wireLifecycle = vi.fn()
      const io = makeFakeIo()

      await requestConnect(io as any, db, { host: 'localhost', port: 25565, username: 'T' }, wireLifecycle)

      expect(wireLifecycle).toHaveBeenCalledWith(fakeBot)
    })

    it('rolls back desiredState and emits disconnected when connectBot throws', async () => {
      setDesiredState(db, 'disconnected')
      connectBotMock.mockImplementation(() => {
        throw new Error('DNS failure')
      })
      const io = makeFakeIo()

      await expect(
        requestConnect(io as any, db, { host: 'bad-host', port: 25565, username: 'T' }),
      ).rejects.toThrow('DNS failure')

      expect(getDesiredState(db)).toBe('disconnected')
      expect(io.emit).toHaveBeenCalledWith('bot:status', 'connecting')
      expect(io.emit).toHaveBeenCalledWith('bot:status', 'disconnected')
    })

    it('rolls back desiredState when wireLifecycle throws after connect', async () => {
      setDesiredState(db, 'disconnected')
      const fakeBot = { on: vi.fn() }
      connectBotMock.mockReturnValue(fakeBot)
      const wireLifecycle = vi.fn(() => {
        throw new Error('wire failure')
      })
      const io = makeFakeIo()

      await expect(
        requestConnect(
          io as any,
          db,
          { host: 'localhost', port: 25565, username: 'T' },
          wireLifecycle,
        ),
      ).rejects.toThrow('wire failure')

      expect(getDesiredState(db)).toBe('disconnected')
      expect(io.emit).toHaveBeenCalledWith('bot:status', 'disconnected')
    })
  })

  describe('requestDisconnect', () => {
    it('sets desiredState to "disconnected" and calls disconnectBot', async () => {
      setDesiredState(db, 'connected')
      getBotMock.mockReturnValue({ entity: {} })
      const io = makeFakeIo()

      await requestDisconnect(io as any, db)

      expect(getDesiredState(db)).toBe('disconnected')
      expect(disconnectBotMock).toHaveBeenCalled()
    })

    it('emits disconnected status after disconnect', async () => {
      setDesiredState(db, 'connected')
      getBotMock.mockReturnValue({ entity: {} })
      const io = makeFakeIo()

      await requestDisconnect(io as any, db)

      expect(io.emit).toHaveBeenCalledWith('bot:status', 'disconnected')
    })

    it('is a no-op when already disconnected', async () => {
      setDesiredState(db, 'disconnected')
      getBotMock.mockReturnValue(null)
      const io = makeFakeIo()

      await requestDisconnect(io as any, db)

      expect(disconnectBotMock).not.toHaveBeenCalled()
    })
  })
})
