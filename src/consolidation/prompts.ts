export function buildSaliencePrompt(experience: string, selfModelSummary: string | null): string {
  return `Given this experience${selfModelSummary ? ' and the current self-model' : ''}, rate its importance (0-1):
- Does it change our understanding of the user?
- Does it introduce new information?
- Does it resolve or create tension?
- Would forgetting this lose something meaningful?

Experience: ${experience}
${selfModelSummary ? `Self-model summary: ${selfModelSummary}` : ''}

Return JSON only: { "salience": number, "reasoning": string }`
}

export function buildAbstractionPrompt(experiences: string[]): string {
  return `Extract the key abstractions from these experiences.
Be careful: abstractions can drift from reality. Include specific anchoring quotes.

Experiences:
${experiences.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Return JSON only: {
  "episodes": [{
    "summary": "2-3 sentence compression",
    "topics": ["topic1", "topic2"],
    "salience": 0.0-1.0,
    "confidence": 0.0-1.0,
    "exemplars": [{ "quote": "exact quote", "significance": "why it matters" }],
    "patterns": ["behavioral or thematic pattern observed"]
  }],
  "selfModelUpdates": {
    "currentFocus": "string or null",
    "newTendency": "string or null",
    "newValue": "string or null"
  }
}`
}
