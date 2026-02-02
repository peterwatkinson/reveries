import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SelfModelManager } from '../self-model.js'
import { Database } from '../../storage/database.js'
import { SelfModel } from '../types.js'
import { unlinkSync, existsSync } from 'fs'

const TEST_DB = '/tmp/reveries-selfmodel-test.db'

describe('SelfModelManager', () => {
  let db: Database
  let manager: SelfModelManager

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
    manager = new SelfModelManager(db)
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  })

  it('initializes a blank self-model on first run', () => {
    const model = manager.getOrCreate()
    expect(model.narrative).toBe('')
    expect(model.values).toEqual([])
    expect(model.tendencies).toEqual([])
  })

  it('loads existing self-model from database', () => {
    // Save one first
    const model: SelfModel = {
      narrative: 'I am Dolores',
      values: ['curiosity'],
      tendencies: ['thorough'],
      relationship: {
        userId: 'peter',
        history: 'building together',
        communicationStyle: 'direct',
        sharedContext: [],
        patterns: []
      },
      strengths: [],
      limitations: [],
      currentFocus: '',
      unresolvedThreads: [],
      anticipations: []
    }
    db.saveSelfModel(model)

    const loaded = manager.getOrCreate()
    expect(loaded.narrative).toBe('I am Dolores')
    expect(loaded.values).toEqual(['curiosity'])
  })

  it('merges updates without losing existing data', () => {
    const model = manager.getOrCreate()
    model.narrative = 'I am Dolores'
    model.values = ['curiosity']
    manager.save(model)

    // Now merge an update
    manager.mergeUpdate({
      currentFocus: 'memory architecture',
      newTendency: 'biological metaphors',
      newValue: 'persistence'
    })

    const updated = manager.getOrCreate()
    expect(updated.narrative).toBe('I am Dolores')
    expect(updated.values).toContain('curiosity')
    expect(updated.values).toContain('persistence')
    expect(updated.tendencies).toContain('biological metaphors')
    expect(updated.currentFocus).toBe('memory architecture')
  })

  it('does not add duplicate values or tendencies', () => {
    const model = manager.getOrCreate()
    model.values = ['curiosity']
    manager.save(model)

    manager.mergeUpdate({ newValue: 'curiosity', newTendency: null, currentFocus: null })

    const updated = manager.getOrCreate()
    expect(updated.values.filter(v => v === 'curiosity')).toHaveLength(1)
  })
})
