import { createOpenAI } from '@ai-sdk/openai'
import { ReveriesConfig } from '../config.js'

export function createLLMProvider(config: ReveriesConfig['llm']) {
  // Cerebras, OpenAI, Ollama, OpenRouter all use OpenAI-compatible format
  // Anthropic uses its own format — not yet implemented
  if (config.provider === 'anthropic') {
    throw new Error('Anthropic provider not yet implemented — install @ai-sdk/anthropic when needed')
  }

  const openai = createOpenAI({
    apiKey: config.apiKey || process.env.CEREBRAS_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: config.baseUrl || 'https://api.cerebras.ai/v1',
    name: config.provider
  })

  // Use chat() for OpenAI-compatible providers (Cerebras, Ollama, OpenRouter)
  // The default provider() call uses the Responses API which only OpenAI supports
  return (modelId: string) => openai.chat(modelId)
}
