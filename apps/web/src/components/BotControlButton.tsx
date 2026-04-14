import type { BotStatus } from '@minebot/shared'

// TODO(multi-bot): recibir `botName` ademas de status, y mostrar el nombre del bot seleccionado.
interface Props {
  status: BotStatus
  onConnect: () => void
  onDisconnect: () => void
}

interface Visuals {
  label: string
  background: string
  disabled: boolean
  action: 'connect' | 'disconnect' | null
}

function resolveVisuals(status: BotStatus): Visuals {
  switch (status) {
    case 'connecting':
      return { label: 'CONECTANDO', background: 'var(--mc-warning)', disabled: true, action: null }
    case 'connected':
      return { label: 'EXPULSAR', background: 'var(--mc-success)', disabled: false, action: 'disconnect' }
    case 'dead':
      return { label: 'EXPULSAR', background: 'var(--mc-warning)', disabled: false, action: 'disconnect' }
    case 'disconnected':
    default:
      return { label: 'AGREGAR', background: 'var(--mc-danger)', disabled: false, action: 'connect' }
  }
}

export function BotControlButton({ status, onConnect, onDisconnect }: Props) {
  const visuals = resolveVisuals(status)

  const handleClick = () => {
    if (visuals.action === 'connect') onConnect()
    else if (visuals.action === 'disconnect') onDisconnect()
  }

  return (
    <button
      onClick={handleClick}
      disabled={visuals.disabled}
      className="mc-btn"
      style={{
        fontSize: '0.4rem',
        padding: '0.4rem 0.8rem',
        background: visuals.background,
        opacity: visuals.disabled ? 0.6 : 1,
        cursor: visuals.disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {visuals.label}
    </button>
  )
}
