import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

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
    conversationModel: 'zai-glm-4.7',
    monologueModel: 'gpt-oss-120b',
    consolidationModel: 'gpt-oss-120b',
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

const CONFIG_DIR = path.join(homedir(), '.reveries')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        (target[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>
      )
    } else {
      result[key] = source[key]
    }
  }
  return result
}

export function loadConfig(): ReveriesConfig {
  let fileConfig: Record<string, unknown> = {}

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      fileConfig = JSON.parse(raw)
    } catch (e) {
      console.error('Failed to load config:', e)
    }
  }

  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    fileConfig
  ) as unknown as ReveriesConfig

  // Override with environment variables
  if (process.env.CEREBRAS_API_KEY && !merged.llm.apiKey) {
    merged.llm.apiKey = process.env.CEREBRAS_API_KEY
  }
  if (process.env.OPENAI_API_KEY && !merged.llm.apiKey) {
    merged.llm.apiKey = process.env.OPENAI_API_KEY
  }

  return merged
}

export function saveConfig(config: Partial<ReveriesConfig>): void {
  mkdirSync(CONFIG_DIR, { recursive: true })

  // Load existing file config, merge with new values, save
  let existing: Record<string, unknown> = {}
  if (existsSync(CONFIG_PATH)) {
    try {
      existing = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    } catch {
      // Start fresh if file is corrupt
    }
  }

  const merged = deepMerge(existing, config as unknown as Record<string, unknown>)
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2))
}
