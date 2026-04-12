import { describe, it, expect } from 'vitest'
import { evaluateState, type EvalContext } from '../bot/state-machine.js'

function makeContext(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    health: 20,
    food: 20,
    nearestHostileDistance: Infinity,
    hasActiveCommand: false,
    isNight: false,
    isOutdoors: true,
    inventoryFull: false,
    ...overrides,
  }
}

describe('evaluateState', () => {
  it('returns surviving when health is critically low', () => {
    expect(evaluateState(makeContext({ health: 4 }))).toBe('surviving')
  })

  it('returns surviving when hostile mob is close', () => {
    expect(evaluateState(makeContext({ nearestHostileDistance: 3 }))).toBe('surviving')
  })

  it('returns executing_command when there is an active command', () => {
    expect(evaluateState(makeContext({ hasActiveCommand: true }))).toBe('executing_command')
  })

  it('returns maintaining when it is night and outdoors', () => {
    expect(evaluateState(makeContext({ isNight: true, isOutdoors: true }))).toBe('maintaining')
  })

  it('returns idle when nothing else applies', () => {
    expect(evaluateState(makeContext())).toBe('idle')
  })

  it('surviving takes priority over active command', () => {
    expect(evaluateState(makeContext({ health: 4, hasActiveCommand: true }))).toBe('surviving')
  })
})
