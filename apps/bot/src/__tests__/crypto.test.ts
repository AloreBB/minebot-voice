import { describe, it, expect, beforeEach, vi } from 'vitest'
import { encryptApiKey, decryptApiKey, maskApiKey } from '../crypto.js'

describe('crypto', () => {
  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', 'a'.repeat(64))
  })

  describe('encryptApiKey / decryptApiKey', () => {
    it('round-trips to the original plaintext', () => {
      const key = 'sk-ant-api03-AbcXyz1234'
      expect(decryptApiKey(encryptApiKey(key))).toBe(key)
    })

    it('produces different IVs on each call for the same input', () => {
      const a = encryptApiKey('same-key')
      const b = encryptApiKey('same-key')
      expect(a.iv).not.toBe(b.iv)
    })

    it('throws when ciphertext is corrupted (GCM auth tag mismatch)', () => {
      const payload = encryptApiKey('test-value')
      payload.ct = 'deadbeef00112233'
      expect(() => decryptApiKey(payload)).toThrow()
    })

    it('throws when ENCRYPTION_MASTER_KEY is not set', () => {
      vi.unstubAllEnvs()
      expect(() => encryptApiKey('x')).toThrow('ENCRYPTION_MASTER_KEY')
    })
  })

  describe('maskApiKey', () => {
    it('shows first 3 and last 4 chars for long keys', () => {
      expect(maskApiKey('sk-ant-api03-AbcXyz')).toBe('sk-...cXyz')
    })

    it('returns **** for keys 8 chars or shorter', () => {
      expect(maskApiKey('shortkey')).toBe('****')
      expect(maskApiKey('short')).toBe('****')
    })
  })
})