import jwt from 'jsonwebtoken'
import { Router } from 'express'
import type { LoginRequest, LoginResponse } from '@minebot/shared'

function getSecret(): string {
  return process.env.JWT_SECRET || 'fallback-dev-secret'
}

export function createToken(password: string): string | null {
  if (password !== process.env.ACCESS_PASSWORD) return null
  return jwt.sign({ auth: true }, getSecret(), { expiresIn: '24h' })
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, getSecret())
    return true
  } catch {
    return false
  }
}

export function authRouter(): Router {
  const router = Router()

  router.post('/api/login', (req, res) => {
    const { password } = req.body as LoginRequest
    const token = createToken(password)
    if (!token) {
      res.status(401).json({ error: 'Invalid password' })
      return
    }
    const response: LoginResponse = { token }
    res.json(response)
  })

  return router
}
