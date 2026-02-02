import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryGraph } from '../graph.js'
import { retrieve } from '../retrieval.js'

describe('Associative Retrieval', () => {
  let graph: MemoryGraph

  beforeEach(() => {
    graph = new MemoryGraph()

    // Build a small memory network
    graph.addNode({ id: 'work-project', type: 'episode', embedding: [0.9, 0.1, 0], salience: 0.8, lastAccessed: new Date(), accessCount: 3, data: { summary: 'Working on fintech platform' } })
    graph.addNode({ id: 'deadline-stress', type: 'episode', embedding: [0.7, 0.3, 0], salience: 0.7, lastAccessed: new Date(), accessCount: 1, data: { summary: 'Stressed about March deadline' } })
    graph.addNode({ id: 'team-issue', type: 'episode', embedding: [0.5, 0.5, 0], salience: 0.6, lastAccessed: new Date(), accessCount: 0, data: { summary: 'Frustration with deployment process' } })
    graph.addNode({ id: 'unrelated', type: 'episode', embedding: [0, 0, 1], salience: 0.5, lastAccessed: new Date(), accessCount: 0, data: { summary: 'Likes hiking' } })

    // Link the work-related memories
    graph.addLink('work-project', 'deadline-stress', 0.8, 'causal')
    graph.addLink('deadline-stress', 'team-issue', 0.6, 'thematic')
  })

  it('retrieves associatively connected memories', () => {
    const results = retrieve(graph, {
      queryEmbedding: [0.85, 0.15, 0],
      limit: 3,
      maxHops: 2,
      decayPerHop: 0.5,
      activationThreshold: 0.01
    })

    const ids = results.map(r => r.id)
    expect(ids).toContain('work-project')
    expect(ids).toContain('deadline-stress')
    expect(ids).toContain('team-issue')
    expect(ids).not.toContain('unrelated')
  })

  it('reinforces accessed memories', () => {
    const before = graph.getNode('work-project')!.accessCount

    retrieve(graph, {
      queryEmbedding: [0.85, 0.15, 0],
      limit: 3,
      maxHops: 2,
      decayPerHop: 0.5,
      activationThreshold: 0.01
    })

    const after = graph.getNode('work-project')!.accessCount
    expect(after).toBe(before + 1)
  })

  it('returns empty array when graph is empty', () => {
    const empty = new MemoryGraph()
    const results = retrieve(empty, {
      queryEmbedding: [1, 0, 0],
      limit: 5,
      maxHops: 2,
      decayPerHop: 0.5,
      activationThreshold: 0.01
    })
    expect(results).toEqual([])
  })

  it('respects limit parameter', () => {
    const results = retrieve(graph, {
      queryEmbedding: [0.85, 0.15, 0],
      limit: 1,
      maxHops: 2,
      decayPerHop: 0.5,
      activationThreshold: 0.01
    })
    expect(results).toHaveLength(1)
  })
})
