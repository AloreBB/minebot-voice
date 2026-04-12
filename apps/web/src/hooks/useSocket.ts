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

const MAX_ACTIVITY_ITEMS = 100

export function useSocket(token: string) {
  const socketRef = useRef<TypedSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [botStatus, setBotStatus] = useState<BotStatus>('disconnected')
  const [stats, setStats] = useState<BotStats | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [lastResponse, setLastResponse] = useState<CommandResponse | null>(null)

  useEffect(() => {
    const socket: TypedSocket = io({
      auth: { token },
    })

    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('bot:stats', setStats)
    socket.on('bot:status', setBotStatus)
    socket.on('bot:inventory', setInventory)
    socket.on('bot:activity', (event) => {
      setActivity(prev => [event, ...prev].slice(0, MAX_ACTIVITY_ITEMS))
    })
    socket.on('command:response', setLastResponse)

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [token])

  const sendCommand = useCallback((text: string) => {
    const command: VoiceCommand = { text, timestamp: Date.now() }
    socketRef.current?.emit('voice:command', command)
  }, [])

  return {
    connected,
    botStatus,
    stats,
    inventory,
    activity,
    lastResponse,
    sendCommand,
  }
}
