import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '../../storage/database.js'
import { encodeExperience } from '../encoder.js'
import { unlinkSync, existsSync } from 'fs'

const TEST_DB = '/tmp/reveries-encoder-test.db'

describe('Experience Encoder', () => {
  let db: Database

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  })

  const mockEmbed = async (text: string): Promise<number[]> => {
    // Simple mock: return hash-like array
    return [text.length / 100, 0.5, 0.3]
  }

  it('encodes a conversation to the raw buffer', async () => {
    const exp = await encodeExperience(
      'User: Hello\n\nMe: Hi there!',
      'conversation',
      { conversationId: 'conv-1', topics: ['greeting'] },
      db,
      mockEmbed
    )

    expect(exp.id).toBeDefined()
    expect(exp.type).toBe('conversation')
    expect(exp.content).toBe('User: Hello\n\nMe: Hi there!')
    expect(exp.embedding).toHaveLength(3)
    expect(exp.salience).toBeGreaterThan(0)
    expect(exp.processed).toBe(false)

    // Should be in the database
    const stored = db.getRawExperiences({ processed: false })
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe(exp.id)
  })

  it('encodes a monologue fragment', async () => {
    const exp = await encodeExperience(
      'I was thinking about the deployment discussion...',
      'monologue',
      { unresolvedTensions: ['deployment process'] },
      db,
      mockEmbed
    )

    expect(exp.type).toBe('monologue')
    expect(exp.processed).toBe(false)
  })

  it('assigns higher salience to longer content with questions', async () => {
    const short = await encodeExperience('ok', 'conversation', {}, db, mockEmbed)
    const long = await encodeExperience(
      'What do you think about the architecture? I have concerns about the deployment pipeline and whether we should restructure the team.',
      'conversation', {}, db, mockEmbed
    )

    expect(long.salience).toBeGreaterThan(short.salience)
  })
})
