import { describe, it, expect } from 'vitest'
import { isQuiescent, detectStuckLoop } from '../quiescence.js'

describe('Quiescence Detection', () => {
  it('detects settling phrases', () => {
    expect(isQuiescent("I've processed what I needed to. Thoughts settling.")).toBe(true)
    expect(isQuiescent("That's enough for now. Resting.")).toBe(true)
    expect(isQuiescent("Nothing more to process. At peace with this.")).toBe(true)
    expect(isQuiescent("I'm content with where things stand.")).toBe(true)
  })

  it('does not trigger on active reflection', () => {
    expect(isQuiescent("This connects to what Peter said about the deployment...")).toBe(false)
    expect(isQuiescent("I wonder if the architecture should be restructured.")).toBe(false)
    expect(isQuiescent("There's something interesting about how memory consolidation works.")).toBe(false)
  })

  it('detects stuck loops', () => {
    expect(detectStuckLoop("I should think about this. I should think about this. I should think about this.")).toBe(true)
    expect(detectStuckLoop("processing processing processing processing processing")).toBe(true)
  })

  it('does not flag varied repetition as stuck', () => {
    expect(detectStuckLoop("The project is interesting. The architecture is sound. The team is capable.")).toBe(false)
  })

  it('treats stuck loops as quiescent', () => {
    const repeating = "I should think about this. I should think about this. I should think about this."
    expect(isQuiescent(repeating)).toBe(true)
  })
})
