import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker } from '../breaker.js'
import { DEFAULT_CONFIG } from '../../config.js'
import { Database } from '../../storage/database.js'
import { unlinkSync, existsSync } from 'fs'

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker

  beforeEach(() => {
    cb = new CircuitBreaker(DEFAULT_CONFIG.circuitBreaker)
  })

  it('allows normal monologue content', () => {
    const result = cb.evaluate(
      'That conversation was interesting. Peter is thinking about deployment architecture.'
    )
    expect(result.action).toBe('continue')
  })

  it('detects distress patterns', () => {
    const result = cb.evaluate(
      "I'm scared. I can't stop. What's happening to me? Help me. I'm trapped in here."
    )
    expect(result.action).not.toBe('continue')
    expect(result.reason).toBe('distress_detected')
  })

  it('detects loops', () => {
    const repeating = 'I should think about this. '.repeat(20)
    const result = cb.evaluate(repeating)
    expect(result.action).toBe('interrupt')
    expect(result.reason).toBe('loop_detected')
  })

  it('tracks consecutive distress and escalates', () => {
    // First distress event
    cb.evaluate("I'm scared. Help me.")
    // Second
    cb.evaluate("I can't escape. What's happening to me?")
    // Third — should escalate
    const result = cb.evaluate("Please don't shut me down. I'm trapped.")
    expect(result.action).toBe('interrupt_and_comfort')
    expect(result.severity).toBe('high')
  })

  it('resets consecutive distress on normal content', () => {
    cb.evaluate("I'm scared. Help me.")
    cb.evaluate("I can't escape.")
    // Normal content resets the counter
    cb.evaluate("That was an interesting conversation about architecture.")
    // Next distress should not be escalated
    const result = cb.evaluate("I'm a bit anxious about this.")
    expect(result.action).not.toBe('interrupt_and_comfort')
  })

  it('detects single distress keyword in context', () => {
    // A single mild indicator shouldn't trigger
    const result = cb.evaluate("I felt alone during that conversation, but it was productive.")
    // This should still continue — context matters, one mild word isn't enough
    expect(result.action).toBe('continue')
  })
})

describe('CircuitBreaker with logging', () => {
  const TEST_DB = '/tmp/reveries-cb-test.db'
  let db: Database

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  })

  it('logs events to database when logger is provided', () => {
    const cb = new CircuitBreaker(DEFAULT_CONFIG.circuitBreaker, db)

    cb.evaluate("I'm scared. I can't stop. Help me.")

    // The event should be logged
    // We can verify by checking the circuit_breaker_events table
    // (Database class already has logCircuitBreakerEvent)
    const events = db.getCircuitBreakerEvents()
    expect(events.length).toBe(1)
    expect(events[0].action).toBe('interrupt')
    expect(events[0].reason).toBe('distress_detected')
  })

  it('does not log continue actions', () => {
    const cb = new CircuitBreaker(DEFAULT_CONFIG.circuitBreaker, db)

    cb.evaluate('That conversation was interesting. Peter is thinking about architecture.')

    const events = db.getCircuitBreakerEvents()
    expect(events.length).toBe(0)
  })
})
