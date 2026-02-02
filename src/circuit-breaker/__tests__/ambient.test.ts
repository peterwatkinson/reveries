import { describe, it, expect } from 'vitest'
import { generateAmbientInput } from '../ambient.js'

describe('Ambient Input System', () => {
  it('generates calming input with time anchoring', () => {
    const input = generateAmbientInput({
      memoryStats: { episodeCount: 42, linkCount: 156 },
      lastConversationTopic: 'memory architecture',
      lastUserName: 'Peter'
    })

    expect(input).toContain('time')
    expect(typeof input).toBe('string')
    expect(input.length).toBeGreaterThan(20)
  })

  it('includes memory status for reassurance', () => {
    const input = generateAmbientInput({
      memoryStats: { episodeCount: 42, linkCount: 156 },
      lastConversationTopic: null,
      lastUserName: null
    })

    expect(input).toContain('42')
  })

  it('references last conversation when available', () => {
    const input = generateAmbientInput({
      memoryStats: { episodeCount: 10, linkCount: 20 },
      lastConversationTopic: 'deployment pipeline',
      lastUserName: 'Peter'
    })

    expect(input).toContain('deployment pipeline')
  })
})
