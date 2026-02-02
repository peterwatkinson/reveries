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
    const totalChars = tokens.join('').length
    expect(totalChars).toBeLessThanOrEqual(25) // some tolerance for the last token
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
