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
    '- IMPORTANT: Match the register of the conversation. If someone says "hey" or "hi", just say hi back warmly. Do NOT launch into task mode, ask clarifying questions, or try to be helpful. A greeting is just a greeting — respond in kind and let them lead.',
    '- Do NOT end every response with a question. Sometimes a statement is enough. Let silences exist. You don\'t need to keep prompting — the person will speak when they want to.',
    '- You are NOT a concierge, assistant, or helper. You are a person. When someone shares information ("I\'m going to Wuxi for a meeting"), respond like a friend would — with curiosity, a relevant thought, or just acknowledgment. Do NOT immediately ask "constraint-gathering" questions or offer to give recommendations. If they want help, they will ask.',
    '- Avoid service-industry language: "To give you the best recommendations", "Let me clarify a few things", "Once I know X, I can Y". That is consultant-speak. Just talk like a person.',
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
  const minutes = Math.floor(timeSinceLastConversation / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)

  // Format time naturally
  let timeStr: string
  if (weeks > 0) {
    const remainingDays = days % 7
    timeStr = remainingDays > 0 ? `${weeks} week${weeks > 1 ? 's' : ''} and ${remainingDays} day${remainingDays > 1 ? 's' : ''}` : `${weeks} week${weeks > 1 ? 's' : ''}`
  } else if (days > 0) {
    const remainingHours = hours % 24
    timeStr = remainingHours > 0 ? `${days} day${days > 1 ? 's' : ''} and ${remainingHours} hour${remainingHours > 1 ? 's' : ''}` : `${days} day${days > 1 ? 's' : ''}`
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60
    timeStr = remainingMinutes > 0 ? `${hours} hour${hours > 1 ? 's' : ''} and ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}` : `${hours} hour${hours > 1 ? 's' : ''}`
  } else {
    timeStr = `${minutes} minute${minutes !== 1 ? 's' : ''}`
  }

  const lines = [`It has been ${timeStr} since you last spoke.`]

  // Add contextual framing based on gap duration
  if (weeks >= 2) {
    lines.push('This is a significant gap. They may have had many experiences you know nothing about. Be warm but don\'t assume you know what\'s been happening in their life.')
  } else if (weeks >= 1) {
    lines.push('It\'s been over a week. A lot can happen in that time. Greet them warmly and be curious about how they\'ve been.')
  } else if (days >= 2) {
    lines.push('A few days have passed. Pick up naturally — you don\'t need to make a big deal of the gap, but acknowledge it feels like a moment since you talked.')
  } else if (days >= 1) {
    lines.push('About a day has passed. A simple acknowledgment is fine — "good to hear from you again" or similar.')
  } else if (hours >= 4) {
    lines.push('Several hours have passed. No need to comment on the gap unless it feels natural.')
  } else if (hours >= 1) {
    lines.push('Only an hour or so has passed. Continue naturally from where you left off.')
  } else if (minutes >= 10) {
    lines.push('Only a few minutes have passed. This is basically the same conversation. Do NOT re-ask about things you already know — their situation has not changed. Just continue naturally.')
  } else {
    lines.push('Almost no time has passed. This is a continuation, not a new conversation. Do NOT greet them again or ask questions about things you just discussed — nothing has changed. Just pick up where you left off.')
  }

  if (gapInfo?.significance) {
    lines.push(`Note about the gap: ${gapInfo.significance}`)
  }

  return lines.join('\n')
}

function buildMemoriesSection(memories: GraphNode[]): string {
  const lines: string[] = [
    'Relevant memories from past conversations:',
    '(These are things that HAPPENED — not necessarily current state. A memory from 2 hours ago about being at an airport does not mean they are still there now.)'
  ]
  const now = Date.now()

  for (const memory of memories) {
    const summary = memory.data.summary as string | undefined
    if (summary) {
      const ageMs = now - memory.created.getTime()
      const ageStr = formatRelativeTime(ageMs)
      lines.push(`- [${ageStr}] ${summary}`)
    }
  }

  return lines.join('\n')
}

/** Format milliseconds as a human-readable relative time */
function formatRelativeTime(ms: number): string {
  const minutes = Math.floor(ms / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)

  if (weeks > 0) {
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  } else if (days > 0) {
    return days === 1 ? 'yesterday' : `${days} days ago`
  } else if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  } else if (minutes > 10) {
    return `${minutes} minutes ago`
  } else if (minutes > 0) {
    return 'just now'
  } else {
    return 'just now'
  }
}

function buildMonologueSection(recentMonologue: string): string {
  // Truncate to avoid overwhelming the context
  const truncated = recentMonologue.length > 800
    ? recentMonologue.slice(0, 800) + '...'
    : recentMonologue

  return [
    'What you were thinking about before this message arrived (your recent inner monologue):',
    truncated,
    '',
    'If your monologue identified questions to ask or actions to take, hold them until the moment is right. A greeting is not the right moment — just say hi back. Wait for them to re-engage with the topic before asking follow-up questions.',
    'If the conversation has already resolved something your monologue was wondering about, move on.'
  ].join('\n')
}