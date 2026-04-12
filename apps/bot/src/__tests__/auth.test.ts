import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createToken, verifyToken } from '../auth.js'

describe('auth', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'test-secret')
    vi.stubEnv('ACCESS_PASSWORD', 'test-password')
  })

  describe('createToken', () => {
    it('returns null for wrong password', () => {
      expect(createToken('wrong')).toBeNull()
    })

    it('returns a JWT string for correct password', () => {
      const token = createToken('test-password')
      expect(token).toBeTypeOf('string')
      expect(token!.split('.')).toHaveLength(3)
    })
  })

  describe('verifyToken', () => {
    it('returns false for invalid token', () => {
      expect(verifyToken('garbage')).toBe(false)
    })

    it('returns true for valid token', () => {
      const token = createToken('test-password')!
      expect(verifyToken(token)).toBe(true)
    })
  })
})
