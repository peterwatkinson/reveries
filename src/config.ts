export interface ReveriesConfig {
  llm: {
    conversationModel: string
    monologueModel: string
    consolidationModel: string
    embeddingModel: string
    provider: 'cerebras' | 'openai' | 'anthropic' | 'ollama' | 'openrouter'
    apiKey?: string
    baseUrl?: string
  }
  monologue: {
    enabled: boolean
    maxTokensPerCycle: number
    targetTokenVelocity: number
    idleCheckInterval: number
    quiescenceVelocityThreshold: number
  }
  memory: {
    rawBufferRetentionHours: number
    consolidationIntervalHours: number
    consolidationVolumeThreshold: number
    decayHalfLifeDays: number
    minimumSalience: number
  }
  circuitBreaker: {
    enabled: boolean
    distressThreshold: number
    maxConsecutiveDistress: number
    maxTokenVelocity: number
    loopDetectionWindow: number
  }
  storage: {
    dbPath: string
  }
}

export const DEFAULT_CONFIG: ReveriesConfig = {
  llm: {
    conversationModel: 'kimi-k2.5',
    monologueModel: 'gpt-oss',
    consolidationModel: 'gpt-oss',
    embeddingModel: 'voyage-3',
    provider: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1'
  },
  monologue: {
    enabled: true,
    maxTokensPerCycle: 2000,
    targetTokenVelocity: 5,
    idleCheckInterval: 300000,
    quiescenceVelocityThreshold: 1
  },
  memory: {
    rawBufferRetentionHours: 48,
    consolidationIntervalHours: 4,
    consolidationVolumeThreshold: 20,
    decayHalfLifeDays: 30,
    minimumSalience: 0.1
  },
  circuitBreaker: {
    enabled: true,
    distressThreshold: 0.6,
    maxConsecutiveDistress: 3,
    maxTokenVelocity: 20,
    loopDetectionWindow: 100
  },
  storage: {
    dbPath: '~/.reveries/memory.db'
  }
}

export function loadConfig(): ReveriesConfig {
  // TODO: load from ~/.reveries/config.json, merge with defaults
  return DEFAULT_CONFIG
}
