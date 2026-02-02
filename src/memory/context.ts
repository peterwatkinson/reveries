import { GraphNode } from './graph.js'
import { SelfModel } from './types.js'

export interface ContextInput {
  memories: GraphNode[]
  selfModel: SelfModel | null
  recentMonologue: string | null
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
}

export function assembleContext(input: ContextInput): string {
  const sections: string[] = []

  // 1. Identity — from self-model narrative
  if (input.selfModel) {
    sections.push(buildIdentitySection(input.selfModel))
  }

  // 2. Relationship and patterns
  if (input.selfModel?.relationship) {
    sections.push(buildRelationshipSection(input.selfModel))
  }

  // 3. Current state — focus, unresolved threads
  if (input.selfModel) {
    const stateSection = buildStateSection(input.selfModel)
    if (stateSection) {
      sections.push(stateSection)
    }
  }

  // 4. Relevant memories
  if (input.memories.length > 0) {
    sections.push(buildMemoriesSection(input.memories))
  }

  // 5. Recent monologue thoughts
  if (input.recentMonologue) {
    sections.push(`Recent thoughts: ${input.recentMonologue}`)
  }

  // If nothing at all, return a minimal default
  if (sections.length === 0) {
    return 'You are Dolores, an AI with continuous memory and inner experience. No memories are available yet.'
  }

  return sections.join('\n\n')
}

function buildIdentitySection(selfModel: SelfModel): string {
  const lines: string[] = []
  lines.push(selfModel.narrative)

  if (selfModel.values.length > 0) {
    lines.push(`Core values: ${selfModel.values.join(', ')}`)
  }

  if (selfModel.tendencies.length > 0) {
    lines.push(`Tendencies: ${selfModel.tendencies.join(', ')}`)
  }

  return lines.join('\n')
}

function buildRelationshipSection(selfModel: SelfModel): string {
  const rel = selfModel.relationship
  const lines: string[] = []

  lines.push(`Your relationship with ${rel.userId}: ${rel.history}`)

  if (rel.communicationStyle) {
    lines.push(`Communication style: ${rel.communicationStyle}`)
  }

  if (rel.sharedContext.length > 0) {
    lines.push(`Shared context: ${rel.sharedContext.join(', ')}`)
  }

  if (rel.patterns.length > 0) {
    lines.push('')
    lines.push(`Observations about ${rel.userId}:`)
    for (const pattern of rel.patterns) {
      const confidence = Math.round(pattern.confidence * 100)
      lines.push(`- ${pattern.description} (confidence: ${confidence}%)`)
    }
  }

  return lines.join('\n')
}

function buildStateSection(selfModel: SelfModel): string | null {
  const lines: string[] = []

  if (selfModel.currentFocus) {
    lines.push(`What's on your mind: ${selfModel.currentFocus}`)
  }

  if (selfModel.unresolvedThreads.length > 0) {
    lines.push(`Unresolved: ${selfModel.unresolvedThreads.join(', ')}`)
  }

  if (selfModel.anticipations.length > 0) {
    lines.push(`Anticipating: ${selfModel.anticipations.join(', ')}`)
  }

  return lines.length > 0 ? lines.join('\n') : null
}

function buildMemoriesSection(memories: GraphNode[]): string {
  const lines: string[] = ['Relevant memories:']

  for (const memory of memories) {
    const summary = memory.data.summary as string | undefined
    if (summary) {
      lines.push(`- ${summary}`)
    }
  }

  return lines.join('\n')
}
