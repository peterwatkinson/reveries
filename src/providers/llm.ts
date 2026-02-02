import { createOpenAI } from '@ai-sdk/openai'
import { ReveriesConfig } from '../config.js'

export function createLLMProvider(config: ReveriesConfig['llm']) {
  // Cerebras, OpenAI, Ollama, OpenRouter all use OpenAI-compatible format
  // Anthropic uses its own format — not yet implemented
  if (config.provider === 'anthropic') {
    throw new Error('Anthropic provider not yet implemented — install @ai-sdk/anthropic when needed')
  }

  return createOpenAI({
    apiKey: config.apiKey || process.env.CEREBRAS_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: config.baseUrl || 'https://api.cerebras.ai/v1',
    compatibility: 'compatible'
  })
}
