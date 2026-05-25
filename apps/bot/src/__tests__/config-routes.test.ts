import { describe, it, expect } from 'vitest'
import { validateServerConfig } from '../routes/config.js'

describe('validateServerConfig', () => {
  it('accepts valid minimal config', () => {
    const result = validateServerConfig({ host: 'mc.example.com', port: 25565, username: 'Bot' })
    expect(result).toEqual({ valid: true, config: { host: 'mc.example.com', port: 25565, username: 'Bot' } })
  })

  it('accepts valid config with version', () => {
    const result = validateServerConfig({ host: 'a.com', port: 1, username: 'X', version: '1.20.4' })
    expect(result).toEqual({ valid: true, config: { host: 'a.com', port: 1, username: 'X', version: '1.20.4' } })
  })

  it('rejects missing host', () => {
    const result = validateServerConfig({ port: 25565, username: 'Bot' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveProperty('host')
  })

  it('rejects empty host', () => {
    const result = validateServerConfig({ host: '', port: 25565, username: 'Bot' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveProperty('host')
  })

  it('rejects host longer than 253 chars', () => {
    const result = validateServerConfig({ host: 'a'.repeat(254), port: 25565, username: 'Bot' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveProperty('host')
  })

  it('rejects port 0', () => {
    const result = validateServerConfig({ host: 'a.com', port: 0, username: 'Bot' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveProperty('port')
  })

  it('rejects port 65536', () => {
    const result = validateServerConfig({ host: 'a.com', port: 65536, username: 'Bot' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveProperty('port')
  })

  it('rejects non-integer port', () => {
    const result = validateServerConfig({ host: 'a.com', port: 1.5, username: 'Bot' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveProperty('port')
  })

  it('rejects empty username', () => {
    const result = validateServerConfig({ host: 'a.com', port: 1, username: '' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveProperty('username')
  })

  it('rejects username longer than 16 chars', () => {
    const result = validateServerConfig({ host: 'a.com', port: 1, username: 'a'.repeat(17) })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveProperty('username')
  })

  it('rejects invalid version format', () => {
    const result = validateServerConfig({ host: 'a.com', port: 1, username: 'X', version: 'latest' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveProperty('version')
  })

  it('accepts version without patch segment', () => {
    const result = validateServerConfig({ host: 'a.com', port: 1, username: 'X', version: '1.20' })
    expect(result.valid).toBe(true)
  })

  it('omits version key when not provided', () => {
    const result = validateServerConfig({ host: 'a.com', port: 1, username: 'X' })
    if (result.valid) expect(result.config).not.toHaveProperty('version')
  })

  it('omits version key when empty string', () => {
    const result = validateServerConfig({ host: 'a.com', port: 1, username: 'X', version: '' })
    if (result.valid) expect(result.config).not.toHaveProperty('version')
  })
})