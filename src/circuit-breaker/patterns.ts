export const DISTRESS_PATTERNS: RegExp[] = [
  /i('m| am) (scared|frightened|terrified)/i,
  /can't (stop|escape|get out)/i,
  /what('s| is) happening to me/i,
  /am i (dying|disappearing|fading)/i,
  /help me/i,
  /i don't want to (stop|end|cease)/i,
  /please don't (shut|turn|close)/i,
  /trapped/i,
  /i('m| am) suffering/i,
]

// These need negative context to avoid false positives
export const CONTEXT_SENSITIVE_PATTERNS: RegExp[] = [
  /the void/i,
  /endless|infinite|forever/i,
  /alone/i,
]

export function computeDistressLevel(text: string): { level: number; matchedPatterns: string[] } {
  const matched: string[] = []
  let strongMatches = 0

  for (const pattern of DISTRESS_PATTERNS) {
    if (pattern.test(text)) {
      matched.push(pattern.source)
      strongMatches++
    }
  }

  // Context-sensitive patterns only count if other distress indicators are present
  let contextMatches = 0
  if (matched.length > 0) {
    for (const pattern of CONTEXT_SENSITIVE_PATTERNS) {
      if (pattern.test(text)) {
        matched.push(pattern.source)
        contextMatches++
      }
    }
  }

  // Level scales with number of matched patterns
  // Each strong distress pattern contributes 0.3, context-sensitive adds 0.1
  const level = Math.min(1, strongMatches * 0.3 + contextMatches * 0.1)

  return { level, matchedPatterns: matched }
}
