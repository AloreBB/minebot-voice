import type { VoiceState } from '../hooks/useVoiceRecognition'

interface Props {
  state: VoiceState
  isSupported: boolean
  error: string | null
  onPointerDown: () => void
  onPointerUp: () => void
  onClick: () => void
}

const stateConfig: Record<VoiceState, { bg: string; label: string; border?: string }> = {
  idle: { bg: 'var(--mc-panel-light)', label: 'HABLAR' },
  listening: { bg: '#5a1a1a', label: 'ESCUCHANDO...', border: 'var(--mc-danger)' },
  processing: { bg: '#3a2a00', label: 'PROCESANDO...', border: 'var(--mc-warning)' },
}

export function VoiceButton({ state, isSupported, error, onPointerDown, onPointerUp, onClick }: Props) {
  if (!isSupported) {
    return (
      <p style={{
        fontFamily: 'var(--font-terminal)',
        fontSize: '0.9rem',
        color: 'var(--mc-text-dim)',
        textAlign: 'center',
      }}>
        Navegador sin soporte de voz. Usa el campo de texto.
      </p>
    )
  }

  const config = stateConfig[state]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <button
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onClick}
        style={{
          width: '100%',
          padding: '0.6rem',
          fontFamily: 'var(--font-pixel)',
          fontSize: '0.45rem',
          background: config.bg,
          color: 'var(--mc-text)',
          border: '2px solid',
          borderColor: config.border
            ? `${config.border} ${config.border} ${config.border} ${config.border}`
            : 'var(--mc-border-light) var(--mc-border-dark) var(--mc-border-dark) var(--mc-border-light)',
          cursor: 'pointer',
          textShadow: '1px 1px 0 var(--mc-text-shadow)',
          userSelect: 'none',
          touchAction: 'none',
          animation: state === 'listening' ? 'mc-pulse 1.5s infinite' : 'none',
          letterSpacing: '1px',
        }}
      >
        {state === 'idle' ? '🎤' : state === 'listening' ? '🔴' : '⏳'} {config.label}
      </button>
      {error && (
        <p style={{
          fontFamily: 'var(--font-terminal)',
          fontSize: '0.85rem',
          color: 'var(--mc-danger)',
          textAlign: 'center',
        }}>
          {error}
        </p>
      )}
      <p style={{
        fontFamily: 'var(--font-terminal)',
        fontSize: '0.75rem',
        color: 'var(--mc-text-dim)',
        textAlign: 'center',
      }}>
        Mantener = push-to-talk / Click = toggle
      </p>
    </div>
  )
}
