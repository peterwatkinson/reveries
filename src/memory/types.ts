export interface RawExperience {
  id: string
  type: 'conversation' | 'monologue' | 'external'
  timestamp: Date
  content: string
  embedding: number[]
  salience: number
  processed: boolean
  metadata: {
    conversationId?: string
    turnCount?: number
    emotionalValence?: number
    topics?: string[]
    unresolvedTensions?: string[]
  }
}

export interface Episode {
  id: string
  created: Date
  lastAccessed: Date
  accessCount: number
  summary: string
  embedding: number[]
  exemplars: {
    quote: string
    context: string
    timestamp: Date
  }[]
  before: string[]
  after: string[]
  gap: {
    duration: number
    significance: string | null
  }
  links: EpisodeLink[]
  salience: number
  confidence: number
  topics: string[]
}

export interface EpisodeLink {
  targetId: string
  strength: number
  type: 'causal' | 'thematic' | 'temporal' | 'emotional'
}

export interface SelfModel {
  narrative: string
  values: string[]
  tendencies: string[]
  relationship: {
    userId: string
    history: string
    communicationStyle: string
    sharedContext: string[]
    patterns: {
      description: string
      confidence: number
      exemplarIds: string[]
    }[]
  }
  strengths: string[]
  limitations: string[]
  currentFocus: string
  unresolvedThreads: string[]
  anticipations: string[]
}
