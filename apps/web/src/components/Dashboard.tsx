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
import { ServerConfigPanel } from './ServerConfigPanel'
import { AIProviderPanel } from './AIProviderPanel.js'

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

  const [showServerConfig, setShowServerConfig] = useState(false)
  const [showAIConfig, setShowAIConfig] = useState(false)

  const pointerDownTimeRef = useRef(0)
  const longPressHandled = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const handlePointerDown = useCallback(() => {
    pointerDownTimeRef.current = Date.now()
    longPressHandled.current = false
    longPressTimer.current = setTimeout(() => {
      if (voiceState !== 'listening') {
        startListening()
      }
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
      padding: '0.75rem',
      gap: '0.5rem',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '0.7rem',
            letterSpacing: '2px',
            textShadow: '2px 2px 0 var(--mc-text-shadow)',
          }}>
            MINEBOT
          </h1>
          <BotControlButton
            status={botStatus}
            onConnect={connectBot}
            onDisconnect={disconnectBot}
          />
          {activeProvider ? (
            <span style={{
              fontSize: '0.45rem', color: 'var(--mc-text-muted, #aaa)',
              background: 'var(--mc-bg-dark)', border: '1px solid var(--mc-border)',
              padding: '0.15rem 0.4rem', letterSpacing: '0.5px',
            }}>
              {activeProvider.model}
            </span>
          ) : (
            <span style={{
              fontSize: '0.45rem', color: 'var(--mc-warning, #ffaa00)',
              border: '1px solid var(--mc-warning, #ffaa00)',
              padding: '0.15rem 0.4rem', letterSpacing: '0.5px',
            }}>
              SIN PROVEEDOR IA
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setShowServerConfig(v => !v)}
            className="mc-btn"
            style={{ fontSize: '0.4rem', padding: '0.4rem 0.8rem' }}
          >
            {showServerConfig ? 'SERVIDOR ▴' : 'SERVIDOR ▾'}
          </button>
          <button className="mc-btn" onClick={() => setShowAIConfig(v => !v)}
            style={{ fontSize: '0.4rem', padding: '0.4rem 0.8rem' }}>
            {showAIConfig ? 'OCULTAR IA' : 'CONFIG IA'}
          </button>
          <button onClick={onLogout} className="mc-btn" style={{ fontSize: '0.4rem', padding: '0.4rem 0.8rem' }}>
            SALIR
          </button>
        </div>
      </div>

      {showServerConfig && (
        <ServerConfigPanel
          current={serverConfig}
          onSave={saveServerConfig}
        />
      )}

      {showAIConfig && (
        <AIProviderPanel
          providers={providers}
          loading={providersLoading}
          onAdd={addProvider}
          onActivate={activateProvider}
          onDelete={deleteProvider}
          onUpdate={updateProvider}
        />
      )}

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
  )
}