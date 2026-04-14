import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'

// Mock mineflayer BEFORE importing the module under test
const createBotMock = vi.fn()
vi.mock('mineflayer', () => ({
  default: { createBot: (...args: unknown[]) => createBotMock(...args) },
  createBot: (...args: unknown[]) => createBotMock(...args),
}))
vi.mock('../bot/plugins.js', () => ({
  loadPlugins: vi.fn(),
}))

// Dynamic import so mocks apply
const { connectBot, disconnectBot, getBot, getBotConfig } = await import('../bot/index.js')

interface FakeBot extends EventEmitter {
  quit: ReturnType<typeof vi.fn>
  chat: ReturnType<typeof vi.fn>
}

function makeFakeBot(): FakeBot {
  const emitter = new EventEmitter() as FakeBot
  emitter.quit = vi.fn(() => emitter.emit('end', 'quit called'))
  emitter.chat = vi.fn()
  return emitter
}

describe('bot runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    createBotMock.mockReset()
    disconnectBot()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('connectBot creates a mineflayer bot and stores config', () => {
    const fake = makeFakeBot()
    createBotMock.mockReturnValue(fake)

    const bot = connectBot({ host: 'localhost', port: 25565, username: 'TestBot' })

    expect(createBotMock).toHaveBeenCalledWith(expect.objectContaining({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      auth: 'offline',
    }))
    expect(bot).toBe(fake)
    expect(getBot()).toBe(fake)
    expect(getBotConfig()).toEqual({ host: 'localhost', port: 25565, username: 'TestBot' })
  })

  it('disconnectBot calls quit and clears bot', () => {
    const fake = makeFakeBot()
    createBotMock.mockReturnValue(fake)
    connectBot({ host: 'localhost', port: 25565, username: 'TestBot' })

    disconnectBot()

    expect(fake.quit).toHaveBeenCalled()
    expect(getBot()).toBeNull()
  })

  it('does NOT auto-reconnect after a manual disconnect', () => {
    const fake = makeFakeBot()
    createBotMock.mockReturnValue(fake)
    connectBot({ host: 'localhost', port: 25565, username: 'TestBot' })

    createBotMock.mockClear()
    disconnectBot()

    vi.advanceTimersByTime(10000)
    expect(createBotMock).not.toHaveBeenCalled()
  })

  it('auto-reconnects after a non-manual end event', () => {
    const fake = makeFakeBot()
    createBotMock.mockReturnValueOnce(fake)
    connectBot({ host: 'localhost', port: 25565, username: 'TestBot' })

    const fake2 = makeFakeBot()
    createBotMock.mockReturnValueOnce(fake2)
    fake.emit('end', 'network error')

    vi.advanceTimersByTime(5000)
    expect(createBotMock).toHaveBeenCalledTimes(2)
    expect(getBot()).toBe(fake2)
  })

  it('calling connectBot while a bot exists replaces it without triggering auto-reconnect', () => {
    const fake1 = makeFakeBot()
    const fake2 = makeFakeBot()
    createBotMock.mockReturnValueOnce(fake1).mockReturnValueOnce(fake2)

    connectBot({ host: 'localhost', port: 25565, username: 'Bot1' })
    connectBot({ host: 'localhost', port: 25565, username: 'Bot2' })

    expect(fake1.quit).toHaveBeenCalled()
    expect(getBot()).toBe(fake2)

    createBotMock.mockClear()
    vi.advanceTimersByTime(10000)
    expect(createBotMock).not.toHaveBeenCalled()
  })
})
