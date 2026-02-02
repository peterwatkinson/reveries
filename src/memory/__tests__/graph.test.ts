import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryGraph } from '../graph.js'

describe('MemoryGraph', () => {
  let graph: MemoryGraph

  beforeEach(() => {
    graph = new MemoryGraph()
  })

  it('adds and retrieves nodes', () => {
    graph.addNode({
      id: 'ep-1',
      type: 'episode',
      embedding: [1, 0, 0],
      salience: 0.8,
      created: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      data: { summary: 'test episode' }
    })

    const node = graph.getNode('ep-1')
    expect(node).not.toBeNull()
    expect(node!.data.summary).toBe('test episode')
  })

  it('returns null for missing nodes', () => {
    expect(graph.getNode('nonexistent')).toBeNull()
  })

  it('adds and retrieves links', () => {
    graph.addNode({ id: 'a', type: 'episode', embedding: [1, 0], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0, 1], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addLink('a', 'b', 0.8, 'thematic')

    const links = graph.getLinks('a')
    expect(links).toHaveLength(1)
    expect(links[0].targetId).toBe('b')
    expect(links[0].strength).toBe(0.8)
    expect(links[0].type).toBe('thematic')
  })

  it('returns empty array for nodes with no links', () => {
    graph.addNode({ id: 'a', type: 'episode', embedding: [1], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    expect(graph.getLinks('a')).toEqual([])
  })

  it('finds nearest nodes by embedding (cosine similarity)', () => {
    graph.addNode({ id: 'a', type: 'episode', embedding: [1, 0, 0], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0, 1, 0], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'c', type: 'episode', embedding: [0.9, 0.1, 0], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })

    const nearest = graph.findNearestNodes([1, 0, 0], 2)
    expect(nearest).toHaveLength(2)
    expect(nearest[0].id).toBe('a')   // exact match
    expect(nearest[1].id).toBe('c')   // close match
  })

  it('performs spreading activation through a chain', () => {
    // A -> B -> C chain
    graph.addNode({ id: 'a', type: 'episode', embedding: [1, 0], salience: 0.8, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0.5, 0.5], salience: 0.6, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'c', type: 'episode', embedding: [0, 1], salience: 0.7, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })

    graph.addLink('a', 'b', 0.9, 'causal')
    graph.addLink('b', 'c', 0.8, 'causal')

    const activations = graph.spreadActivation(
      new Map([['a', 1.0]]),
      { maxHops: 2, decayPerHop: 0.5 }
    )

    // A should have highest activation
    expect(activations.get('a')).toBeGreaterThan(0)
    // B should be activated via A
    expect(activations.get('b')).toBeGreaterThan(0)
    // C should be activated via B (two hops)
    expect(activations.get('c')).toBeGreaterThan(0)
    // Energy decays along the chain: a > b > c
    expect(activations.get('a')!).toBeGreaterThan(activations.get('b')!)
    expect(activations.get('b')!).toBeGreaterThan(activations.get('c')!)
  })

  it('accumulates activation from multiple paths', () => {
    // A -> C and B -> C (C reached from two sources)
    graph.addNode({ id: 'a', type: 'episode', embedding: [1, 0], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0, 1], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'c', type: 'episode', embedding: [0.5, 0.5], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })

    graph.addLink('a', 'c', 0.8, 'thematic')
    graph.addLink('b', 'c', 0.7, 'thematic')

    // Activate both A and B
    const activations = graph.spreadActivation(
      new Map([['a', 1.0], ['b', 1.0]]),
      { maxHops: 1, decayPerHop: 0.5 }
    )

    // C should have accumulated energy from both A and B
    const cActivation = activations.get('c')!
    // It should be more than if only one path existed
    expect(cActivation).toBeGreaterThan(0.3)
  })

  it('reinforces nodes on access', () => {
    const oldDate = new Date('2026-01-01')
    graph.addNode({ id: 'a', type: 'episode', embedding: [1], salience: 0.5, created: oldDate, lastAccessed: oldDate, accessCount: 0, data: {} })

    graph.reinforceNode('a')

    const node = graph.getNode('a')!
    expect(node.accessCount).toBe(1)
    expect(node.lastAccessed.getTime()).toBeGreaterThan(oldDate.getTime())
  })

  it('applies decay based on time since last access', () => {
    // Node accessed 90 days ago (3 half-lives with halfLife=30)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    graph.addNode({ id: 'old', type: 'episode', embedding: [1], salience: 0.8, created: ninetyDaysAgo, lastAccessed: ninetyDaysAgo, accessCount: 0, data: {} })

    // Node accessed just now
    graph.addNode({ id: 'recent', type: 'episode', embedding: [0, 1], salience: 0.8, created: new Date(), lastAccessed: new Date(), accessCount: 5, data: {} })

    graph.applyDecay({ halfLifeDays: 30, minimumSalience: 0.1 })

    const old = graph.getNode('old')!
    // 3 half-lives: 0.8 * 0.5^3 = 0.1, but floored at minimumSalience
    expect(old.salience).toBeLessThan(0.2)
    expect(old.salience).toBeGreaterThanOrEqual(0.1)

    const recent = graph.getNode('recent')!
    // Recently accessed, barely decayed
    expect(recent.salience).toBeGreaterThan(0.7)
  })

  it('respects minimum salience floor during decay', () => {
    const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    graph.addNode({ id: 'ancient', type: 'episode', embedding: [1], salience: 0.5, created: veryOld, lastAccessed: veryOld, accessCount: 0, data: {} })

    graph.applyDecay({ halfLifeDays: 30, minimumSalience: 0.05 })

    const node = graph.getNode('ancient')!
    // Should be floored at minimum, not zero
    expect(node.salience).toBe(0.05)
  })

  it('also decays link strengths', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    graph.addNode({ id: 'a', type: 'episode', embedding: [1, 0], salience: 0.8, created: thirtyDaysAgo, lastAccessed: thirtyDaysAgo, accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0, 1], salience: 0.8, created: thirtyDaysAgo, lastAccessed: thirtyDaysAgo, accessCount: 0, data: {} })
    graph.addLink('a', 'b', 0.8, 'thematic')

    graph.applyDecay({ halfLifeDays: 30, minimumSalience: 0.1 })

    const links = graph.getLinks('a')
    // After one half-life, strength should be roughly halved
    expect(links[0].strength).toBeLessThan(0.8)
    expect(links[0].strength).toBeGreaterThan(0.2)
  })

  it('reports node and link counts', () => {
    graph.addNode({ id: 'a', type: 'episode', embedding: [1], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0, 1], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addLink('a', 'b', 0.5, 'thematic')

    expect(graph.nodeCount).toBe(2)
    expect(graph.linkCount).toBe(1)
  })

  it('gets all nodes', () => {
    graph.addNode({ id: 'a', type: 'episode', embedding: [1], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0, 1], salience: 0.5, created: new Date(), lastAccessed: new Date(), accessCount: 0, data: {} })

    const nodes = graph.getAllNodes()
    expect(nodes).toHaveLength(2)
  })
})
