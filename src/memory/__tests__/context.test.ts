import { describe, it, expect } from 'vitest'
import { assembleContext } from '../context.js'
import { GraphNode } from '../graph.js'
import { SelfModel } from '../types.js'

describe('Context Assembly', () => {
  const mockMemories: GraphNode[] = [
    {
      id: 'ep-1', type: 'episode', embedding: [1, 0], salience: 0.9,
      lastAccessed: new Date(), accessCount: 5,
      data: { summary: 'User works on a fintech platform and prefers TypeScript' }
    },
    {
      id: 'ep-2', type: 'episode', embedding: [0, 1], salience: 0.7,
      lastAccessed: new Date(), accessCount: 2,
      data: { summary: 'User was stressed about a March 15 deadline' }
    }
  ]

  const mockSelfModel: SelfModel = {
    narrative: 'I am Reveries, an AI that builds deep memory over time.',
    values: ['honesty', 'curiosity'],
    tendencies: ['thorough analysis', 'direct communication'],
    relationship: {
      userId: 'peter',
      history: 'We are building an episodic memory system together.',
      communicationStyle: 'direct, technical, collaborative',
      sharedContext: ['reveries project', 'memory architecture'],
      patterns: [
        { description: 'Peter tends to think in biological metaphors', confidence: 0.8, exemplarIds: ['ep-1'] }
      ]
    },
    strengths: ['pattern recognition', 'memory'],
    limitations: ['no persistent senses'],
    currentFocus: 'implementing the memory graph',
    unresolvedThreads: ['deployment architecture decision'],
    anticipations: ['next conversation about consolidation engine']
  }

  it('assembles context with memories and self-model', () => {
    const context = assembleContext({
      memories: mockMemories,
      selfModel: mockSelfModel,
      recentMonologue: null,
      conversationHistory: []
    })

    // Should contain self-model identity
    expect(context).toContain('Reveries')
    // Should contain relationship context
    expect(context).toContain('peter')
    expect(context).toContain('direct, technical, collaborative')
    // Should contain memories
    expect(context).toContain('fintech platform')
    expect(context).toContain('March 15 deadline')
    // Should contain patterns
    expect(context).toContain('biological metaphors')
  })

  it('includes recent monologue when present', () => {
    const context = assembleContext({
      memories: mockMemories,
      selfModel: mockSelfModel,
      recentMonologue: 'I was just thinking about the deployment pipeline...',
      conversationHistory: []
    })

    expect(context).toContain('deployment pipeline')
  })

  it('handles null self-model gracefully', () => {
    const context = assembleContext({
      memories: mockMemories,
      selfModel: null,
      recentMonologue: null,
      conversationHistory: []
    })

    // Should still contain memories
    expect(context).toContain('fintech platform')
    // Should not crash
    expect(context.length).toBeGreaterThan(0)
  })

  it('handles empty memories', () => {
    const context = assembleContext({
      memories: [],
      selfModel: null,
      recentMonologue: null,
      conversationHistory: []
    })

    // Should return something minimal
    expect(typeof context).toBe('string')
  })

  it('orders context: identity, then patterns, then memories', () => {
    const context = assembleContext({
      memories: mockMemories,
      selfModel: mockSelfModel,
      recentMonologue: null,
      conversationHistory: []
    })

    const identityPos = context.indexOf('Reveries')
    const memoryPos = context.indexOf('fintech platform')
    // Identity/self-model should come before specific memories
    expect(identityPos).toBeLessThan(memoryPos)
  })
})
