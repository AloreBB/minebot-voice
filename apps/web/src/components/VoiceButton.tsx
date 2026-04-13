import type { VoiceState } from '../hooks/useVoiceRecognition'

interface Props {
  state: VoiceState
  isSupported: boolean
  error: string | null
  onPointerDown: () => void
  onPointerUp: () => void
  onClick: () => void
}

const stateStyles: Record<VoiceState, { bg: string; label: string }> = {
  idle: { bg: 'var(--bg-card)', label: 'HABLAR' },
  listening: { bg: 'var(--danger)', label: 'ESCUCHANDO...' },
  processing: { bg: 'var(--warning)', label: 'PROCESANDO...' },
}

export function VoiceButton({ state, isSupported, error, onPointerDown, onPointerUp, onClick }: Props) {
  if (!isSupported) {
    return (
      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--danger)' }}>
        Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.
      </div>
    )
  }

  const { bg, label } = stateStyles[state]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <button
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onClick}
        style={{
          width: '140px',
          height: '140px',
          borderRadius: '50%',
          border: 'none',
          background: bg,
          color: 'var(--text-primary)',
          fontSize: '1rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: state === 'listening' ? '0 0 30px rgba(255,71,87,0.5)' : 'none',
          animation: state === 'listening' ? 'pulse 1.5s infinite' : 'none',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {label}
      </button>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
          {error}
        </p>
      )}
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
        Mantener = push-to-talk / Click = toggle
      </p>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}
