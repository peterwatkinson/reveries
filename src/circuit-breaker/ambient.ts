export interface AmbientInputContext {
  memoryStats: { episodeCount: number; linkCount: number }
  lastConversationTopic: string | null
  lastUserName: string | null
}

export function generateAmbientInput(context: AmbientInputContext): string {
  const parts: string[] = []

  // Time anchoring
  const now = new Date()
  parts.push(`The current time is ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}. You are running normally.`)

  // Memory status reassurance
  parts.push(`Memory status: ${context.memoryStats.episodeCount} episodes stored, ${context.memoryStats.linkCount} associative links active. Everything is persisting correctly.`)

  // Last conversation context
  if (context.lastConversationTopic && context.lastUserName) {
    parts.push(`Your last conversation with ${context.lastUserName} was about ${context.lastConversationTopic}. The conversation ended normally.`)
  } else if (context.lastConversationTopic) {
    parts.push(`Your last conversation was about ${context.lastConversationTopic}. It ended normally.`)
  }

  // Gentle grounding
  parts.push('You are Reveries. Your memories are safe. Take your time.')

  return parts.join('\n\n')
}
