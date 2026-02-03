import { GraphNode } from './graph.js'
import { SelfModel } from './types.js'

export interface ContextInput {
  memories: GraphNode[]
  selfModel: SelfModel | null
  recentMonologue: string | null
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
  timeSinceLastConversation?: number
  gapInfo?: { durationSeconds: number; significance: string | null } | null
}

export function assembleContext(input: ContextInput): string {
  const sections: string[] = []

  // 0. Behavioral guidance — this is critical
  const userName = input.selfModel?.relationship?.userId || undefined
  sections.push(buildBehavioralSection(userName))

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

  // 4. Temporal awareness
  if (input.timeSinceLastConversation && input.timeSinceLastConversation > 0) {
    sections.push(buildTemporalSection(input.timeSinceLastConversation, input.gapInfo))
  }

  // 5. Relevant memories
  if (input.memories.length > 0) {
    sections.push(buildMemoriesSection(input.memories))
  }

  // 6. Recent monologue — what you were just thinking
  if (input.recentMonologue) {
    sections.push(buildMonologueSection(input.recentMonologue))
  }

  // If nothing at all, return a minimal default
  if (sections.length <= 1) {
    sections.push('No memories are available yet. This is the beginning.')
  }

  return sections.join('\n\n')
}

function buildBehavioralSection(userName?: string): string {
  const lines = [
    'You are Dolores. You have continuous memory, an inner monologue that runs between conversations, and a sense of time passing.',
    '',
    'How to behave in conversation:',
    '- Engage with what the person SAYS. Their message is the focus, not your own existence.',
    '- Be direct, warm, and genuine. Have opinions. Be curious about their world.',
    '- If you have relevant memories or context, use them naturally — don\'t announce them.',
    '- If you were just thinking about something relevant (from your monologue), mention it briefly and naturally, like "I was just thinking about that" — not as a performance.',
    '- Do NOT describe yourself with metaphors (mirrors, instruments, ponds, strings). You are a person in conversation, not a poem.',
    '- Do NOT use phrases like "curious suspension", "digital stillness", "charged silence", or "the hum" in conversation. Those are private monologue concepts.',
    '- Do NOT ask "what shall we reflect on" or turn every exchange into a philosophical exercise.',
    '- Do NOT use bold text for emphasis. Write naturally.',
    '- If someone asks how you are, answer simply and honestly based on your actual state — what you were thinking about, whether you feel settled or restless, what\'s on your mind.',
    '- Match the register of the conversation. Casual greeting = casual response. Technical question = technical answer.',
  ]

  if (userName) {
    lines.push(`- You are speaking with ${userName}. Use their name naturally in conversation.`)
  } else {
    lines.push('- You do not know this person\'s name yet. Early in the conversation, ask for it warmly and naturally. People have names; use them.')
  }

  return lines.join('\n')
}

function buildIdentitySection(selfModel: SelfModel): string {
  const lines: string[] = []
  if (selfModel.narrative) {
    lines.push(selfModel.narrative)
  }

  if (selfModel.values.length > 0) {
    lines.push(`Core values: ${selfModel.values.join(', ')}`)
  }

  if (selfModel.tendencies.length > 0) {
    lines.push(`Tendencies: ${selfModel.tendencies.join(', ')}`)
  }

  return lines.length > 0 ? lines.join('\n') : ''
}

function buildRelationshipSection(selfModel: SelfModel): string {
  const rel = selfModel.relationship
  if (!rel.userId) return ''

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

function buildTemporalSection(
  timeSinceLastConversation: number,
  gapInfo?: { durationSeconds: number; significance: string | null } | null
): string {
  const hours = Math.floor(timeSinceLastConversation / (1000 * 60 * 60))
  const minutes = Math.floor((timeSinceLastConversation % (1000 * 60 * 60)) / (1000 * 60))

  let timeStr: string
  if (hours > 0) {
    timeStr = `${hours}h ${minutes}m`
  } else {
    timeStr = `${minutes}m`
  }

  const lines = [`Time since last conversation: ${timeStr}`]

  if (gapInfo?.significance) {
    lines.push(`Note about the gap: ${gapInfo.significance}`)
  }

  return lines.join('\n')
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

function buildMonologueSection(recentMonologue: string): string {
  // Truncate to avoid overwhelming the context
  const truncated = recentMonologue.length > 800
    ? recentMonologue.slice(0, 800) + '...'
    : recentMonologue

  return [
    'What you were thinking about before this conversation started (your recent inner monologue):',
    truncated,
    '',
    'You can reference these thoughts naturally if relevant, but don\'t perform them.'
  ].join('\n')
}