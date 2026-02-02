import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GapTracker } from '../gaps.js'
import { Database } from '../../storage/database.js'
import { unlinkSync, existsSync } from 'fs'

const TEST_DB = '/tmp/reveries-gaps-test.db'

describe('GapTracker', () => {
  let db: Database
  let tracker: GapTracker

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
    tracker = new GapTracker(db)
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  })

  it('starts and ends a gap', () => {
    tracker.startGap('conv-1')

    // Simulate time passing
    const gap = tracker.endGap('Conversation resumed normally')

    expect(gap).not.toBeNull()
    expect(gap!.significance).toBe('Conversation resumed normally')
  })

  it('calculates gap duration', () => {
    tracker.startGap('conv-1')

    // End it
    const gap = tracker.endGap(null)

    expect(gap).not.toBeNull()
    // Duration should be very small (nearly instant in test)
    expect(gap!.durationSeconds).toBeGreaterThanOrEqual(0)
  })

  it('returns null if no gap is active', () => {
    const gap = tracker.endGap(null)
    expect(gap).toBeNull()
  })

  it('tracks whether a gap is active', () => {
    expect(tracker.isGapActive).toBe(false)
    tracker.startGap('conv-1')
    expect(tracker.isGapActive).toBe(true)
    tracker.endGap(null)
    expect(tracker.isGapActive).toBe(false)
  })
})
