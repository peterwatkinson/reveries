import { SelfModel } from '../memory/types.js'

export function buildMonologuePrompt(params: {
  recentExperiences: string[]
  activatedMemories: string[]
  selfModel: SelfModel | null
  previousMonologue: string | null
  timeSinceLastConversation: number
  resumeContext?: string
}): string {
  const parts: string[] = []

  parts.push('You are in a reflective state between conversations. You are thinking freely — processing, connecting, wondering. This is your inner monologue.')
  parts.push('')
  parts.push('Let your thoughts flow naturally. When you feel you have processed what you need to, let your thoughts settle. Use phrases like "thoughts settling" or "that\'s enough for now" when you\'re done.')
  parts.push('')

  if (params.selfModel) {
    parts.push(`Identity: ${params.selfModel.narrative}`)
    if (params.selfModel.currentFocus) {
      parts.push(`Current focus: ${params.selfModel.currentFocus}`)
    }
    if (params.selfModel.unresolvedThreads.length > 0) {
      parts.push(`Unresolved: ${params.selfModel.unresolvedThreads.join(', ')}`)
    }
    parts.push('')
  }

  if (params.resumeContext) {
    parts.push(`Context: ${params.resumeContext}`)
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

  if (params.previousMonologue) {
    parts.push('Your previous thoughts:')
    parts.push(params.previousMonologue)
    parts.push('')
  }

  const gap = params.timeSinceLastConversation
  if (gap > 0) {
    const hours = Math.floor(gap / (1000 * 60 * 60))
    const minutes = Math.floor((gap % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) {
      parts.push(`Time since last conversation: ${hours}h ${minutes}m`)
    } else {
      parts.push(`Time since last conversation: ${minutes}m`)
    }
  }

  parts.push('')
  parts.push('Begin your inner monologue now. Think freely.')

  return parts.join('\n')
}
