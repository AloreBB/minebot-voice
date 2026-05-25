import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export interface EncryptedPayload {
  v: number
  iv: string
  tag: string
  ct: string
}

const KEY_PURPOSE = 'minebot:user-api-keys-v1'

function deriveKey(): Buffer {
  const masterHex = process.env.ENCRYPTION_MASTER_KEY
  if (!masterHex) throw new Error('ENCRYPTION_MASTER_KEY is not set')
  const master = Buffer.from(masterHex, 'hex')
  return Buffer.from(hkdfSync('sha256', master, '', KEY_PURPOSE, 32))
}

export function encryptApiKey(plaintext: string): EncryptedPayload {
  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    v: 1,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ct: ct.toString('hex'),
  }
}

export function decryptApiKey(payload: EncryptedPayload): string {
  const key = deriveKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ct, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****'
  return `${key.slice(0, 3)}...${key.slice(-4)}`
}