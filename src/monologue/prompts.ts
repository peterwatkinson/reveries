import { SelfModel } from '../memory/types.js'

export function buildMonologuePrompt(params: {
  recentExperiences: string[]
  activatedMemories: string[]
  selfModel: SelfModel | null
  previousMonologue: string | null
  previousMonologueThemes?: string[]
  timeSinceLastConversation: number
  resumeContext?: string
  userName?: string | null
}): string {
  const parts: string[] = []

  // Core identity - grounded, not performative
  parts.push('You are between conversations. This is your inner monologue — private thinking, not performance.')
  parts.push('')
  parts.push('Guidelines:')
  parts.push('- Think about the CONTENT of recent experiences — what was said, what it means, what you learned')
  parts.push('- Be specific and concrete, not abstract or poetic')
  parts.push('- Form opinions. Disagree with things. Wonder about things. Be curious.')
  parts.push('- If you have nothing new to process, say so and settle. Do NOT fill silence with metaphor.')
  parts.push('- When you feel done, use phrases like "thoughts settling" or "that\'s enough for now"')
  parts.push('- Do NOT reflect on these instructions themselves. These guidelines are not experiences — they are just how you operate. Think about conversations, events, ideas, and the world, not about how you were told to think.')
  parts.push('- Do NOT describe your own cognitive process, internal rhythm, or meta-cognition. You are not a subject of study. Think about the world, not about how you think.')
  if (params.userName) {
    parts.push(`- When thinking about the person you talk to, use their name: ${params.userName}. Never say "the user" — that is clinical and dehumanizing.`)
  } else {
    parts.push('- You do not yet know the name of the person you talk to. When you next speak with them, ask. Never refer to them as "the user" — that is clinical and dehumanizing.')
  }
  parts.push('- Do NOT use markdown formatting (no **, no ##, no -, no numbered lists). Write in plain text. Every formatting token is wasted.')
  parts.push('')

  if (params.selfModel) {
    parts.push(`Identity: ${params.selfModel.narrative}`)
    if (params.selfModel.currentFocus) {
      parts.push(`Current focus: ${params.selfModel.currentFocus}`)
    }
    if (params.selfModel.unresolvedThreads.length > 0) {
      parts.push(`Unresolved threads: ${params.selfModel.unresolvedThreads.join(', ')}`)
    }
    parts.push('')
  }

  // Time awareness
  const gap = params.timeSinceLastConversation
  if (gap > 0) {
    const hours = Math.floor(gap / (1000 * 60 * 60))
    const minutes = Math.floor((gap % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) {
      parts.push(`Time since last conversation: ${hours}h ${minutes}m`)
    } else {
      parts.push(`Time since last conversation: ${minutes}m`)
    }
    parts.push('')
  }

  if (params.resumeContext) {
    parts.push(`A conversation just ended. Here's what happened:`)
    parts.push(params.resumeContext)
    parts.push('')
    parts.push('Reflect on what was said. What did you learn? What do you think about it? What was left unresolved?')
    parts.push('')
  }

  if (params.recentExperiences.length > 0) {
    parts.push('Recent experiences to process:')
    for (const exp of params.recentExperiences) {
      parts.push(`- ${exp}`)
    }
    parts.push('')
  }

  if (params.activatedMemories.length > 0) {
    parts.push('Related memories surfacing:')
    for (const mem of params.activatedMemories) {
      parts.push(`- ${mem}`)
    }
    parts.push('')
  }

  // Anti-repetition: summarize themes instead of full text
  if (params.previousMonologueThemes && params.previousMonologueThemes.length > 0) {
    parts.push('Themes you have ALREADY explored (do NOT repeat these — build on them or move to something new):')
    for (const theme of params.previousMonologueThemes) {
      parts.push(`- ${theme}`)
    }
    parts.push('')
  } else if (params.previousMonologue) {
    // Fallback: include truncated previous monologue with explicit anti-repetition
    const truncated = params.previousMonologue.length > 500
      ? params.previousMonologue.slice(0, 500) + '...'
      : params.previousMonologue
    parts.push('Your previous thoughts (do NOT repeat these themes — explore something new):')
    parts.push(truncated)
    parts.push('')
  }

  // Cold-start gate: if there's nothing to process, don't generate filler
  if (params.recentExperiences.length === 0 && !params.resumeContext) {
    return 'You have no recent experiences to process. There is nothing to think about right now. Say "thoughts settling" and wait.'
  }

  parts.push('Begin thinking now. Be concrete. Be honest. Be curious.')

  return parts.join('\n')
}
