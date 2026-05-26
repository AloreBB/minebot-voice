import { useState } from 'react'
import type { AIProvider, ServerConfig } from '@minebot/shared'
import type { AddProviderData, AddProviderResult } from '../hooks/useAIProviders.js'
import { ServerConfigPanel } from './ServerConfigPanel.js'
import { AIProviderPanel } from './AIProviderPanel.js'

type Tab = 'ai' | 'server'

interface Props {
  open: boolean
  initialTab?: Tab
  onClose: () => void
  serverConfig: ServerConfig | null
  onSaveServer: (cfg: ServerConfig) => Promise<void>
  providers: AIProvider[]
  providersLoading: boolean
  onAdd: (data: AddProviderData) => Promise<AddProviderResult>
  onActivate: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onUpdate: (id: number, data: Partial<AddProviderData>) => Promise<void>
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'ai', label: '◆ PROVEEDOR IA' },
  { key: 'server', label: '⬡ SERVIDOR' },
]

export function ConfigDrawer({
  open, initialTab = 'ai', onClose,
  serverConfig, onSaveServer,
  providers, providersLoading, onAdd, onActivate, onDelete, onUpdate,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.72)',
          zIndex: 100,
        }}
      />

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(100vw, 520px)',
        background: 'var(--mc-panel)',
        borderLeft: '3px solid var(--mc-border-light)',
        zIndex: 101,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Drawer header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1rem',
          background: 'var(--mc-bg)',
          borderBottom: '2px solid var(--mc-border-dark)',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: 'var(--font-pixel)', fontSize: '0.6rem',
            letterSpacing: '2px', color: 'var(--mc-text)',
          }}>
            CONFIGURACIÓN
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--mc-border-dark)',
              color: 'var(--mc-text-dim)', cursor: 'pointer',
              fontFamily: 'var(--font-terminal)', fontSize: '1.6rem',
              lineHeight: 1, padding: '0.1rem 0.5rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex',
          background: 'var(--mc-bg)',
          borderBottom: '2px solid var(--mc-border-dark)',
          flexShrink: 0,
        }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '0.8rem',
                fontFamily: 'var(--font-pixel)', fontSize: '0.45rem',
                letterSpacing: '0.8px', cursor: 'pointer',
                border: 'none', background: 'transparent',
                borderBottom: tab === key ? '3px solid var(--mc-emerald)' : '3px solid transparent',
                color: tab === key ? 'var(--mc-text)' : 'var(--mc-text-dim)',
                transition: 'color 0.1s, border-color 0.1s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {tab === 'ai' && (
            <AIProviderPanel
              providers={providers}
              loading={providersLoading}
              onAdd={onAdd}
              onActivate={onActivate}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
          )}
          {tab === 'server' && (
            <ServerConfigPanel current={serverConfig} onSave={onSaveServer} />
          )}
        </div>
      </div>
    </>
  )
}
