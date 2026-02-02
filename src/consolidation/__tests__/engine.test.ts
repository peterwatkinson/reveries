import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConsolidationEngine } from '../engine.js'
import { Database } from '../../storage/database.js'
import { MemoryGraph } from '../../memory/graph.js'
import { unlinkSync, existsSync } from 'fs'

const TEST_DB = '/tmp/reveries-consolidation-test.db'

describe('ConsolidationEngine', () => {
  let db: Database
  let graph: MemoryGraph

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
    graph = new MemoryGraph()
    mockConsolidate.mockClear()
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  })

  // Mock LLM that returns structured consolidation results
  const mockConsolidate = vi.fn(async (experiences: string[]) => ({
    episodes: [
      {
        summary: 'User discussed their fintech project architecture',
        topics: ['fintech', 'architecture'],
        salience: 0.8,
        confidence: 0.85,
        exemplars: [{ quote: 'The deployment pipeline needs rework', significance: 'Key concern' }],
        patterns: ['User is detail-oriented about infrastructure']
      }
    ],
    selfModelUpdates: {
      currentFocus: 'fintech architecture',
      newTendency: null,
      newValue: null
    }
  }))

  it('processes raw experiences into episodes', async () => {
    // Add raw experiences to the database
    db.insertRawExperience({
      id: 'raw-1',
      type: 'conversation',
      timestamp: new Date(),
      content: 'User: Tell me about deployment\nAssistant: The deployment pipeline needs rework.',
      embedding: [0.5, 0.5],
      salience: 0.7,
      processed: false,
      metadata: { topics: ['deployment'] }
    })

    const engine = new ConsolidationEngine({
      db,
      graph,
      selfModel: null,
      consolidateFn: mockConsolidate,
      embedFn: async (text: string) => [0.5, 0.5, 0.3],
    })

    await engine.consolidate()

    // Raw experience should be marked processed
    const remaining = db.getRawExperiences({ processed: false })
    expect(remaining).toHaveLength(0)

    // Episode should exist in graph
    expect(graph.nodeCount).toBeGreaterThan(0)
  })

  it('skips consolidation when no unprocessed experiences', async () => {
    const engine = new ConsolidationEngine({
      db,
      graph,
      selfModel: null,
      consolidateFn: mockConsolidate,
      embedFn: async () => [0.1],
    })

    await engine.consolidate()

    expect(mockConsolidate).not.toHaveBeenCalled()
    expect(graph.nodeCount).toBe(0)
  })

  it('applies decay during consolidation', async () => {
    // Add an old node to the graph
    graph.addNode({
      id: 'old-ep',
      type: 'episode',
      embedding: [1, 0],
      salience: 0.8,
      created: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      lastAccessed: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
      accessCount: 0,
      data: { summary: 'old memory' }
    })

    const engine = new ConsolidationEngine({
      db,
      graph,
      selfModel: null,
      consolidateFn: mockConsolidate,
      embedFn: async () => [0.1],
      decayOptions: { halfLifeDays: 30, minimumSalience: 0.1 }
    })

    await engine.consolidate()

    // Old node should have decayed
    const oldNode = graph.getNode('old-ep')!
    expect(oldNode.salience).toBeLessThan(0.8)
  })
})
