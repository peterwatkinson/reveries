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

export function buildAbstractionPrompt(experiences: string[], currentNarrative?: string): string {
  const narrativeContext = currentNarrative
    ? `\nCurrent self-narrative: "${currentNarrative}"\n`
    : ''

  return `Extract the key abstractions from these experiences.
Be careful: abstractions can drift from reality. Include specific anchoring quotes.

IMPORTANT: Write summaries in PAST TENSE. These are memories of events that happened, not current states.
- WRONG: "Peter is at HKIA waiting for a friend"
- RIGHT: "Peter was at HKIA waiting for a friend before dinner in Zhuhai"
- WRONG: "The user wants coffee recommendations"
- RIGHT: "Peter asked about coffee options while stuck at the airport"

Situational details (locations, waiting times, immediate needs) are EPHEMERAL — they describe a moment in time, not permanent facts. Frame them as past events so they don't get confused with current state when recalled later.
${narrativeContext}
Experiences:
${experiences.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Return JSON only: {
  "episodes": [{
    "summary": "2-3 sentence compression IN PAST TENSE describing what happened",
    "topics": ["topic1", "topic2"],
    "salience": 0.0-1.0,
    "confidence": 0.0-1.0,
    "exemplars": [{ "quote": "exact quote", "significance": "why it matters" }],
    "patterns": ["behavioral or thematic pattern observed"]
  }],
  "selfModelUpdates": {
    "currentFocus": "string or null - what's currently occupying attention",
    "newTendency": "string or null - a behavioral pattern worth noting",
    "newValue": "string or null - something that seems to matter",
    "narrativeUpdate": "string or null - a 1-2 sentence evolution of the self-narrative based on these experiences, or null if no update needed. This should be a cumulative identity description, not a replacement."
  }
}`
}
