import { useEffect, useRef, useState, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  BotStats,
  InventoryItem,
  ActivityEvent,
  BotStatus,
  CommandResponse,
  VoiceCommand,
} from '@minebot/shared'

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

interface ActivityRow {
  id: number
  type: string
  message: string
  timestamp: number
}

function apiRowToEvent(row: ActivityRow): ActivityEvent {
  return {
    id: String(row.id),
    type: row.type as ActivityEvent['type'],
    message: row.message,
    timestamp: row.timestamp,
  }
}

export function useSocket(token: string) {
  const socketRef = useRef<TypedSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [botStatus, setBotStatus] = useState<BotStatus>('disconnected')
  const [stats, setStats] = useState<BotStats | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [lastResponse, setLastResponse] = useState<CommandResponse | null>(null)
  const [hasMoreActivity, setHasMoreActivity] = useState(false)
  const [loadingActivity, setLoadingActivity] = useState(false)

  // Track the oldest DB id we've loaded (for cursor pagination)
  const oldestIdRef = useRef<number | null>(null)

  // Load initial activity from API
  const loadInitialActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/activity?limit=50', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { events: ActivityRow[]; hasMore: boolean }

      const events = data.events.map(apiRowToEvent)
      setActivity(events) // newest first (API returns desc order)
      setHasMoreActivity(data.hasMore)

      if (data.events.length > 0) {
        oldestIdRef.current = data.events[data.events.length - 1].id
      }
    } catch (err) {
      console.error('[useSocket] Failed to load initial activity:', err)
    }
  }, [token])

  // Load more (older) activity for infinite scroll
  const loadMoreActivity = useCallback(async () => {
    if (loadingActivity || !hasMoreActivity || oldestIdRef.current === null) return

    setLoadingActivity(true)
    try {
      const res = await fetch(`/api/activity?limit=50&before=${oldestIdRef.current}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { events: ActivityRow[]; hasMore: boolean }

      const olderEvents = data.events.map(apiRowToEvent)
      setActivity(prev => [...prev, ...olderEvents]) // append older events at the end
      setHasMoreActivity(data.hasMore)

      if (data.events.length > 0) {
        oldestIdRef.current = data.events[data.events.length - 1].id
      }
    } catch (err) {
      console.error('[useSocket] Failed to load more activity:', err)
    } finally {
      setLoadingActivity(false)
    }
  }, [token, loadingActivity, hasMoreActivity])

  useEffect(() => {
    const socket: TypedSocket = io({
      auth: { token },
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      loadInitialActivity()
    })
    socket.on('disconnect', () => setConnected(false))

    socket.on('bot:stats', setStats)
    socket.on('bot:status', setBotStatus)
    socket.on('bot:inventory', setInventory)
    socket.on('bot:activity', (event) => {
      // Cap at 500 items in memory — older items can be re-fetched from the DB
      setActivity(prev => [event, ...prev].slice(0, 500))
    })
    socket.on('command:response', setLastResponse)

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [token, loadInitialActivity])

  const sendCommand = useCallback((text: string) => {
    const command: VoiceCommand = { text, timestamp: Date.now() }
    socketRef.current?.emit('voice:command', command)
  }, [])

  const connectBot = useCallback(() => {
    socketRef.current?.emit('bot:connect')
  }, [])

  const disconnectBot = useCallback(() => {
    socketRef.current?.emit('bot:disconnect')
  }, [])

  return {
    connected,
    botStatus,
    stats,
    inventory,
    activity,
    lastResponse,
    sendCommand,
    connectBot,
    disconnectBot,
    loadMoreActivity,
    hasMoreActivity,
    loadingActivity,
  }
}
