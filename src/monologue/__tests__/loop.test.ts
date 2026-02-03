import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MonologueLoop } from '../loop.js'

describe('MonologueLoop', () => {
  it('generates tokens and writes to buffer', async () => {
    const tokens: string[] = []
    const mockGenerate = vi.fn(async function* () {
      yield 'That conversation '
      yield 'was interesting... '
      yield 'thoughts settling.'
    })

    const loop = new MonologueLoop({
      generate: mockGenerate,
      onToken: (token) => tokens.push(token),
      onCycleComplete: vi.fn(),
      maxTokensPerCycle: 1000,
    })

    await loop.runOneCycle()

    expect(tokens).toEqual(['That conversation ', 'was interesting... ', 'thoughts settling.'])
    expect(mockGenerate).toHaveBeenCalledOnce()
  })

  it('calls onCycleComplete with buffer contents', async () => {
    const onComplete = vi.fn()
    const mockGenerate = vi.fn(async function* () {
      yield 'Some reflection content.'
    })

    const loop = new MonologueLoop({
      generate: mockGenerate,
      onToken: vi.fn(),
      onCycleComplete: onComplete,
      maxTokensPerCycle: 1000,
    })

    await loop.runOneCycle()

    expect(onComplete).toHaveBeenCalledWith('Some reflection content.')
  })

  it('respects maxTokensPerCycle budget', async () => {
    const tokens: string[] = []
    // Generator that produces lots of tokens
    const mockGenerate = vi.fn(async function* () {
      for (let i = 0; i < 100; i++) {
        yield 'word '
      }
    })

    const loop = new MonologueLoop({
      generate: mockGenerate,
      onToken: (token) => tokens.push(token),
      onCycleComplete: vi.fn(),
      maxTokensPerCycle: 20, // Only 20 characters worth
    })

    await loop.runOneCycle()

    // Should have stopped before exhausting all 100 tokens
    // Allows up to 1.5x budget (30 chars) when no sentence boundary is found
    const totalChars = tokens.join('').length
    expect(totalChars).toBeLessThanOrEqual(30)
  })

  it('stops at sentence boundary when over budget', async () => {
    const tokens: string[] = []
    const mockGenerate = vi.fn(async function* () {
      yield 'This is a long sentence '  // 25 chars, over 20 budget
      yield 'that keeps going. '         // ends with period
      yield 'And more text after.'       // should not appear
    })

    const loop = new MonologueLoop({
      generate: mockGenerate,
      onToken: (token) => tokens.push(token),
      onCycleComplete: vi.fn(),
      maxTokensPerCycle: 20,
    })

    await loop.runOneCycle()

    // Should stop after the period, not continue to "And more text after."
    const result = tokens.join('')
    expect(result).toBe('This is a long sentence that keeps going. ')
  })

  it('can be paused and resumed', async () => {
    const loop = new MonologueLoop({
      generate: vi.fn(async function* () { yield 'test' }),
      onToken: vi.fn(),
      onCycleComplete: vi.fn(),
      maxTokensPerCycle: 1000,
    })

    expect(loop.isPaused).toBe(false)
    loop.pause()
    expect(loop.isPaused).toBe(true)
    loop.resume()
    expect(loop.isPaused).toBe(false)
  })
})
