import { useSocket } from '../hooks/useSocket'
import { useVoiceRecognition } from '../hooks/useVoiceRecognition'
import { StatsPanel } from './StatsPanel'
import { InventoryGrid } from './InventoryGrid'
import { ActivityFeed } from './ActivityFeed'
import { VoiceButton } from './VoiceButton'
import { CommandDisplay } from './CommandDisplay'

interface Props {
  token: string
  onLogout: () => void
}

export function Dashboard({ token, onLogout }: Props) {
  const { connected, botStatus, stats, inventory, activity, lastResponse, sendCommand } = useSocket(token)
  const { state: voiceState, transcript, startListening, stopListening, toggleListening, isSupported } = useVoiceRecognition(sendCommand)

  let pointerDownTime = 0

  const handlePointerDown = () => {
    pointerDownTime = Date.now()
    startListening()
  }

  const handlePointerUp = () => {
    const held = Date.now() - pointerDownTime
    if (held > 300) {
      stopListening()
    }
  }

  const handleClick = () => {
    const held = Date.now() - pointerDownTime
    if (held <= 300) {
      if (voiceState === 'listening') {
        stopListening()
      }
    }
  }

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
      <VoiceButton
        state={voiceState}
        isSupported={isSupported}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
      />
    </div>
  )
}
