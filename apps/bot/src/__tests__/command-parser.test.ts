import { describe, it, expect } from 'vitest'
import { buildPrompt, parseResponse } from '../ai/command-parser.js'

describe('command-parser', () => {
  describe('buildPrompt', () => {
    it('includes the user command text', () => {
      const prompt = buildPrompt('mina diamantes', {
        health: 20,
        food: 18,
        position: { x: 100, y: 64, z: -50 },
        inventory: ['iron_pickaxe x1', 'cobblestone x32'],
        timeOfDay: 6000,
        isRaining: false,
      })
      expect(prompt).toContain('mina diamantes')
      expect(prompt).toContain('Health: 20')
    })
  })

  describe('parseResponse', () => {
    it('parses valid JSON action array from Claude response', () => {
      const raw = JSON.stringify({
        understood: 'Buscando diamantes',
        actions: [
          { action: 'digDown', toY: -59 },
          { action: 'mine', block: 'diamond_ore', count: 5 },
        ],
      })
      const result = parseResponse(raw)
      expect(result.understood).toBe('Buscando diamantes')
      expect(result.actions).toHaveLength(2)
      expect(result.actions[0].action).toBe('digDown')
    })

    it('returns error response for invalid JSON', () => {
      const result = parseResponse('not json at all')
      expect(result.understood).toContain('No pude procesar')
      expect(result.actions).toHaveLength(0)
    })
  })
})
