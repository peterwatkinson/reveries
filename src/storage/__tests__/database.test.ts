import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '../database.js'
import { unlinkSync, existsSync } from 'fs'

const TEST_DB = '/tmp/reveries-test.db'

describe('Database', () => {
  let db: Database

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  })

  it('creates tables on init', () => {
    const tables = db.listTables()
    expect(tables).toContain('raw_experiences')
    expect(tables).toContain('episodes')
    expect(tables).toContain('episode_links')
    expect(tables).toContain('self_model')
    expect(tables).toContain('monologue_state')
    expect(tables).toContain('gaps')
    expect(tables).toContain('circuit_breaker_events')
  })

  it('inserts and retrieves a raw experience', () => {
    db.insertRawExperience({
      id: 'test-1',
      type: 'conversation',
      timestamp: new Date('2026-01-01'),
      content: 'Hello world',
      embedding: [0.1, 0.2, 0.3],
      salience: 0.5,
      processed: false,
      metadata: { topics: ['greeting'] }
    })

    const result = db.getRawExperiences({ processed: false })
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Hello world')
    expect(result[0].salience).toBe(0.5)
  })

  it('inserts and retrieves an episode', () => {
    db.insertEpisode({
      id: 'ep-1',
      created: new Date('2026-01-01'),
      lastAccessed: new Date('2026-01-01'),
      accessCount: 0,
      summary: 'User introduced themselves',
      embedding: [0.1, 0.2],
      exemplars: [{ quote: 'Hi, I am Peter', context: 'first message', timestamp: new Date() }],
      before: [],
      after: [],
      gap: { duration: 0, significance: null },
      links: [],
      salience: 0.8,
      confidence: 0.9,
      topics: ['introduction']
    })

    const result = db.getEpisode('ep-1')
    expect(result).not.toBeNull()
    expect(result!.summary).toBe('User introduced themselves')
  })

  it('inserts and retrieves episode links', () => {
    const baseEpisode = {
      created: new Date(), lastAccessed: new Date(), accessCount: 0,
      summary: 'test', embedding: [0.1], exemplars: [],
      before: [], after: [], gap: { duration: 0, significance: null },
      links: [], salience: 0.5, confidence: 0.5, topics: []
    }
    db.insertEpisode({ ...baseEpisode, id: 'ep-1' })
    db.insertEpisode({ ...baseEpisode, id: 'ep-2' })

    db.insertEpisodeLink('ep-1', 'ep-2', 0.7, 'thematic')

    const links = db.getEpisodeLinks('ep-1')
    expect(links).toHaveLength(1)
    expect(links[0].targetId).toBe('ep-2')
    expect(links[0].strength).toBe(0.7)
  })

  it('loads and saves self model', () => {
    const model = {
      narrative: 'I am Reveries',
      values: ['curiosity'],
      tendencies: ['thorough'],
      relationship: {
        userId: 'peter',
        history: 'We are building together',
        communicationStyle: 'direct',
        sharedContext: ['reveries project'],
        patterns: []
      },
      strengths: ['memory'],
      limitations: ['no senses'],
      currentFocus: 'building memory system',
      unresolvedThreads: [],
      anticipations: []
    }

    db.saveSelfModel(model)
    const loaded = db.loadSelfModel()
    expect(loaded).not.toBeNull()
    expect(loaded!.narrative).toBe('I am Reveries')
    expect(loaded!.values).toEqual(['curiosity'])
  })
})
