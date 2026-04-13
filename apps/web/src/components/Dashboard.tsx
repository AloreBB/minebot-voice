import { useRef, useCallback } from 'react'
import { useSocket } from '../hooks/useSocket'
import { useVoiceRecognition } from '../hooks/useVoiceRecognition'
import { StatsPanel } from './StatsPanel'
import { InventoryGrid } from './InventoryGrid'
import { ActivityFeed } from './ActivityFeed'
import { VoiceButton } from './VoiceButton'
import { CommandDisplay } from './CommandDisplay'
import { TextCommandInput } from './TextCommandInput'

interface Props {
  token: string
  onLogout: () => void
}

export function Dashboard({ token, onLogout }: Props) {
  const { connected, botStatus, stats, inventory, activity, lastResponse, sendCommand } = useSocket(token)
  const { state: voiceState, transcript, error: voiceError, startListening, stopListening, isSupported } = useVoiceRecognition(sendCommand)

  const pointerDownTimeRef = useRef(0)
  const longPressHandled = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(null)

  // pointerDown: record time, start listening after 400ms (long press = push-to-talk)
  const handlePointerDown = useCallback(() => {
    pointerDownTimeRef.current = Date.now()
    longPressHandled.current = false
    // If they hold for 400ms, start listening (push-to-talk mode)
    longPressTimer.current = setTimeout(() => {
      if (voiceState !== 'listening') {
        startListening()
      }
    }, 400)
  }, [voiceState, startListening])

  // pointerUp: if held > 400ms it was push-to-talk, stop listening
  const handlePointerUp = useCallback(() => {
    const held = Date.now() - pointerDownTimeRef.current
    if (held > 400 && voiceState === 'listening') {
      longPressHandled.current = true
      stopListening()
    }
  }, [voiceState, stopListening])

  // click: if it wasn't a long press, toggle listening
  const handleClick = useCallback(() => {
    // Cancel the long press timer
    if (longPressTimer.current) clearTimeout(longPressTimer.current)

    if (longPressHandled.current) return
    const held = Date.now() - pointerDownTimeRef.current
    if (held > 400) return // Long press, handled by pointerUp

    // Short click = toggle
    if (voiceState === 'listening') {
      stopListening()
    } else {
      startListening()
    }
  }, [voiceState, startListening, stopListening])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100dvh',
      maxWidth: '600px',
      margin: '0 auto',
      padding: '1rem',
      gap: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.25rem' }}>MineBot Control</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: connected ? 'var(--success)' : 'var(--danger)',
          }} />
          <button
            onClick={onLogout}
            style={{
              background: 'transparent',
              border: '1px solid var(--text-secondary)',
              color: 'var(--text-secondary)',
              padding: '0.25rem 0.75rem',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Salir
          </button>
        </div>
      </div>

      <StatsPanel stats={stats} botStatus={botStatus} />
      <InventoryGrid items={inventory} />
      <ActivityFeed events={activity} />
      <CommandDisplay transcript={transcript} response={lastResponse} />
      <TextCommandInput onSend={sendCommand} disabled={!connected} />
      <VoiceButton
        state={voiceState}
        isSupported={isSupported}
        error={voiceError}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
      />
    </div>
  )
}
