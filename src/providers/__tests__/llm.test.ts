import { describe, it, expect } from 'vitest'
import { createLLMProvider } from '../llm.js'
import { generateEmbedding } from '../embeddings.js'
import { DEFAULT_CONFIG } from '../../config.js'

describe('LLM Provider', () => {
  it('creates an OpenAI-compatible provider for cerebras', () => {
    const provider = createLLMProvider({
      ...DEFAULT_CONFIG.llm,
      apiKey: 'test-key'
    })
    // The provider should be a function that can create model references
    expect(provider).toBeDefined()
    expect(typeof provider).toBe('function')
  })

  it('creates an OpenAI-compatible provider for openai', () => {
    const provider = createLLMProvider({
      ...DEFAULT_CONFIG.llm,
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key'
    })
    expect(provider).toBeDefined()
  })

  it('creates an OpenAI-compatible provider for ollama', () => {
    const provider = createLLMProvider({
      ...DEFAULT_CONFIG.llm,
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'test-key'
    })
    expect(provider).toBeDefined()
  })

  it('creates an OpenAI-compatible provider for openrouter', () => {
    const provider = createLLMProvider({
      ...DEFAULT_CONFIG.llm,
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key'
    })
    expect(provider).toBeDefined()
  })

  it('throws for anthropic provider (not yet implemented)', () => {
    expect(() => createLLMProvider({
      ...DEFAULT_CONFIG.llm,
      provider: 'anthropic',
      apiKey: 'test-key'
    })).toThrow('Anthropic provider not yet implemented')
  })
})

describe('Embeddings', () => {
  it.skipIf(!process.env.VOYAGE_API_KEY)('generates an embedding via Voyage', async () => {
    const result = await generateEmbedding('hello world')
    expect(result.length).toBeGreaterThan(0)
    expect(typeof result[0]).toBe('number')
  })
})
