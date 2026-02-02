import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '../../storage/database.js'
import { MemoryGraph } from '../graph.js'
import { hydrateGraph, persistGraph } from '../hydrator.js'
import { unlinkSync, existsSync } from 'fs'

const TEST_DB = '/tmp/reveries-hydrator-test.db'

describe('Graph Hydration', () => {
  let db: Database

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  })

  it('round-trips graph through SQLite', () => {
    const graph = new MemoryGraph()
    graph.addNode({
      id: 'ep-1', type: 'episode', embedding: [0.1, 0.2],
      salience: 0.8, lastAccessed: new Date('2026-01-15T10:00:00Z'), accessCount: 3,
      data: { summary: 'test episode', topics: ['testing'], confidence: 0.9, exemplars: [], before: [], after: [], gap: { duration: 0, significance: null } }
    })
    graph.addNode({
      id: 'ep-2', type: 'episode', embedding: [0.3, 0.4],
      salience: 0.6, lastAccessed: new Date('2026-01-16T10:00:00Z'), accessCount: 1,
      data: { summary: 'test 2', topics: [], confidence: 0.7, exemplars: [], before: [], after: [], gap: { duration: 0, significance: null } }
    })
    graph.addLink('ep-1', 'ep-2', 0.7, 'thematic')

    persistGraph(graph, db)

    const restored = hydrateGraph(db)

    expect(restored.getNode('ep-1')).not.toBeNull()
    expect(restored.getNode('ep-2')).not.toBeNull()
    expect(restored.getNode('ep-1')!.data.summary).toBe('test episode')
    expect(restored.getNode('ep-1')!.salience).toBe(0.8)
    expect(restored.getNode('ep-1')!.accessCount).toBe(3)
    expect(restored.getLinks('ep-1')).toHaveLength(1)
    expect(restored.getLinks('ep-1')[0].targetId).toBe('ep-2')
    expect(restored.getLinks('ep-1')[0].strength).toBe(0.7)
  })

  it('handles empty database', () => {
    const graph = hydrateGraph(db)
    expect(graph.nodeCount).toBe(0)
    expect(graph.linkCount).toBe(0)
  })

  it('persists updates (upsert)', () => {
    const graph = new MemoryGraph()
    graph.addNode({
      id: 'ep-1', type: 'episode', embedding: [0.1, 0.2],
      salience: 0.8, lastAccessed: new Date(), accessCount: 0,
      data: { summary: 'original', topics: [], confidence: 0.5, exemplars: [], before: [], after: [], gap: { duration: 0, significance: null } }
    })
    persistGraph(graph, db)

    // Modify and re-persist
    const node = graph.getNode('ep-1')!
    node.data.summary = 'updated'
    node.salience = 0.9
    persistGraph(graph, db)

    const restored = hydrateGraph(db)
    expect(restored.getNode('ep-1')!.data.summary).toBe('updated')
    expect(restored.getNode('ep-1')!.salience).toBe(0.9)
  })
})
