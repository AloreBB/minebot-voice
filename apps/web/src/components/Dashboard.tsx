import { useRef, useCallback, useState } from 'react'
import { useSocket } from '../hooks/useSocket'
import { useVoiceRecognition } from '../hooks/useVoiceRecognition'
import { useAIProviders } from '../hooks/useAIProviders.js'
import { StatsPanel } from './StatsPanel'
import { InventoryGrid } from './InventoryGrid'
import { ActivityFeed } from './ActivityFeed'
import { VoiceButton } from './VoiceButton'
import { CommandDisplay } from './CommandDisplay'
import { TextCommandInput } from './TextCommandInput'
import { BotControlButton } from './BotControlButton'
import { ConfigDrawer } from './ConfigDrawer.js'
import { PROVIDER_COLORS } from './AIProviderPanel.js'

interface Props {
  token: string
  onLogout: () => void
}

export function Dashboard({ token, onLogout }: Props) {
  const {
    connected, botStatus, stats, inventory, activity, lastResponse,
    sendCommand, connectBot, disconnectBot,
    loadMoreActivity, hasMoreActivity, loadingActivity,
    serverConfig, saveServerConfig,
  } = useSocket(token)
  const { state: voiceState, transcript, error: voiceError, startListening, stopListening, isSupported } = useVoiceRecognition(sendCommand)
  const {
    providers, loading: providersLoading, activeProvider,
    addProvider, updateProvider, activateProvider, deleteProvider,
  } = useAIProviders(token)

  const [showConfig, setShowConfig] = useState(false)

  const pointerDownTimeRef = useRef(0)
  const longPressHandled = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const handlePointerDown = useCallback(() => {
    pointerDownTimeRef.current = Date.now()
    longPressHandled.current = false
    longPressTimer.current = setTimeout(() => {
      if (voiceState !== 'listening') startListening()
    }, 400)
  }, [voiceState, startListening])

  const handlePointerUp = useCallback(() => {
    const held = Date.now() - pointerDownTimeRef.current
    if (held > 400 && voiceState === 'listening') {
      longPressHandled.current = true
      stopListening()
    }
  }, [voiceState, stopListening])

  const handleClick = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    if (longPressHandled.current) return
    const held = Date.now() - pointerDownTimeRef.current
    if (held > 400) return
    if (voiceState === 'listening') stopListening()
    else startListening()
  }, [voiceState, startListening, stopListening])

  const activeColor = activeProvider ? PROVIDER_COLORS[activeProvider.providerType] : undefined

  return (
    <>
      <ConfigDrawer
        open={showConfig}
        onClose={() => setShowConfig(false)}
        serverConfig={serverConfig}
        onSaveServer={saveServerConfig}
        providers={providers}
        providersLoading={providersLoading}
        onAdd={addProvider}
        onActivate={activateProvider}
        onDelete={deleteProvider}
        onUpdate={updateProvider}
      />

      <div style={{
        display: 'flex', flexDirection: 'column',
        minHeight: '100dvh', maxWidth: '600px',
        margin: '0 auto', padding: '0.75rem', gap: '0.5rem',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '0.5rem 0',
          gap: '0.5rem',
        }}>
          {/* Left: logo + bot control + AI badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
            <h1 style={{
              fontFamily: 'var(--font-pixel)', fontSize: '0.7rem',
              letterSpacing: '2px', textShadow: '2px 2px 0 var(--mc-text-shadow)',
              flexShrink: 0,
            }}>
              MINEBOT
            </h1>
            <BotControlButton status={botStatus} onConnect={connectBot} onDisconnect={disconnectBot} />

            {/* Active AI badge — click to open config */}
            <button
              onClick={() => setShowConfig(true)}
              title={activeProvider ? `Proveedor activo: ${activeProvider.displayName}` : 'Configurar proveedor de IA'}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                background: 'var(--mc-bg)', cursor: 'pointer',
                border: `1px solid ${activeProvider ? 'var(--mc-border-dark)' : 'var(--mc-warning)'}`,
                padding: '0.3rem 0.6rem', flexShrink: 1, minWidth: 0, overflow: 'hidden',
              }}
            >
              {activeProvider ? (
                <>
                  <span style={{
                    width: '0.65rem', height: '0.65rem', flexShrink: 0,
                    background: activeColor,
                    display: 'inline-block',
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-terminal)', fontSize: '1rem',
                    color: 'var(--mc-text)', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {activeProvider.model}
                  </span>
                </>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-terminal)', fontSize: '1rem',
                  color: 'var(--mc-warning)', whiteSpace: 'nowrap',
                }}>
                  ⚠ SIN IA
                </span>
              )}
            </button>
          </div>

          {/* Right: config + logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <button
              onClick={() => setShowConfig(true)}
              className="mc-btn"
              title="Configuración"
              style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.3rem', padding: '0.35rem 0.7rem' }}
            >
              ⚙
            </button>
            <button
              onClick={onLogout}
              className="mc-btn"
              style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.4rem', padding: '0.4rem 0.8rem' }}
            >
              SALIR
            </button>
          </div>
        </div>

        <StatsPanel stats={stats} botStatus={botStatus} />

        <div className="mc-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div className="mc-title">Comandos</div>
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

        <CommandDisplay transcript={transcript} response={lastResponse} />
        <InventoryGrid items={inventory} />
        <ActivityFeed events={activity} onLoadMore={loadMoreActivity} hasMore={hasMoreActivity} loading={loadingActivity} />
      </div>
    </>
  )
}
