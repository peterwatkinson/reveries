const SETTLING_PHRASES = [
  /i('ve| have) processed/i,
  /thoughts?\s+(settling|settled)/i,
  /nothing\s+(more|else)\s+to\s+(think|process|reflect)/i,
  /at peace with (that|this|it|where)/i,
  /resting now/i,
  /that's\s+(all|enough)\s+for now/i,
  /i('m| am)\s+(feeling\s+)?settled\.?\s*$/i,  // Only match at end of text
  /i('m| am)\s+content\s+with/i,  // "I'm content with..."
  /thoughts?\s+settle\.?\s*$/i,  // "thoughts settle" at end
]

export function isQuiescent(text: string): boolean {
  // Check for explicit settling markers
  if (SETTLING_PHRASES.some(p => p.test(text))) {
    return true
  }

  // Check for stuck loops
  if (detectStuckLoop(text)) {
    return true
  }

  return false
}

export function detectStuckLoop(text: string): boolean {
  // Split into sentences
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10)

  // Need at least 4 sentences to detect meaningful repetition
  if (sentences.length >= 4) {
    const unique = new Set(sentences.map(s => s.toLowerCase()))
    const repetitionRatio = unique.size / sentences.length
    // If less than 30% of sentences are unique, it's stuck
    if (repetitionRatio < 0.3) return true
  }

  // Check for CONSECUTIVE phrase repetition (actual loops)
  // Look for patterns like "the hum the hum the hum" or "processing processing processing"
  const words = text.toLowerCase()
    .replace(/[.!?,;:'"()[\]{}]/g, '')  // Strip punctuation
    .split(/\s+/)
    .filter(w => w.length > 0)

  if (words.length < 4) return false

  // Look for repeated consecutive sequences of 1+ words
  // Require 3+ consecutive repeats for short patterns, 2+ for longer ones
  for (let len = 1; len <= Math.min(15, Math.floor(words.length / 3)); len++) {
    const minRepeats = len < 4 ? 3 : 2  // More repeats needed for short patterns
    let consecutiveRepeats = 0
    let i = 0
    while (i + len * 2 <= words.length) {
      const chunk1 = words.slice(i, i + len).join(' ')
      const chunk2 = words.slice(i + len, i + len * 2).join(' ')
      if (chunk1 === chunk2) {
        consecutiveRepeats++
        i += len  // Move past the repeated chunk
      } else {
        consecutiveRepeats = 0
        i++
      }
      if (consecutiveRepeats >= minRepeats) return true
    }
  }

  return false
}
