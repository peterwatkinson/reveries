const SETTLING_PHRASES = [
  /i('ve| have) processed/i,
  /thoughts?\s+(settling|settled)/i,
  /nothing\s+(more|else)\s+to/i,
  /at peace/i,
  /resting now/i,
  /content with/i,
  /that's\s+(all|enough)\s+for now/i,
  /i'm\s+content/i,
  /settled/i,
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
  // Split into sentences or chunks
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 3)

  if (sentences.length < 3) {
    // For short texts without sentence punctuation, check word-level repetition
    const words = text.toLowerCase().split(/\s+/)
    if (words.length >= 5) {
      for (let len = 1; len <= Math.min(10, Math.floor(words.length / 3)); len++) {
        const pattern = words.slice(0, len).join(' ')
        let count = 0
        for (let i = 0; i <= words.length - len; i += len) {
          if (words.slice(i, i + len).join(' ') === pattern) count++
        }
        if (count >= 3) return true
      }
    }
    return false
  }

  // Check if sentences are repeating
  const unique = new Set(sentences.map(s => s.toLowerCase()))
  const repetitionRatio = unique.size / sentences.length

  // If less than 40% of sentences are unique, it's stuck
  if (repetitionRatio < 0.4) return true

  // Also check for word-level repetition
  const words = text.toLowerCase().split(/\s+/)
  if (words.length >= 5) {
    // Look for repeated sequences of 3+ words
    for (let len = 3; len <= Math.min(10, Math.floor(words.length / 3)); len++) {
      const pattern = words.slice(0, len).join(' ')
      let count = 0
      for (let i = 0; i <= words.length - len; i += len) {
        if (words.slice(i, i + len).join(' ') === pattern) count++
      }
      if (count >= 3) return true
    }
  }

  return false
}
