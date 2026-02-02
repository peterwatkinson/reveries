import { nanoid } from 'nanoid'
import { Database } from '../storage/database.js'
import { RawExperience } from './types.js'

export async function encodeExperience(
  content: string,
  type: 'conversation' | 'monologue' | 'external',
  metadata: Record<string, unknown>,
  db: Database,
  embedFn: (text: string) => Promise<number[]>
): Promise<RawExperience> {
  const embedding = await embedFn(content)
  const salience = computeInitialSalience(content)

  const experience: RawExperience = {
    id: nanoid(),
    type,
    timestamp: new Date(),
    content,
    embedding,
    salience,
    processed: false,
    metadata: metadata as RawExperience['metadata']
  }

  db.insertRawExperience(experience)
  return experience
}

function computeInitialSalience(content: string): number {
  let score = 0.3 // base

  // Length bonus (longer = more likely important, up to a point)
  const words = content.split(/\s+/).length
  if (words > 10) score += 0.1
  if (words > 50) score += 0.1
  if (words > 100) score += 0.1

  // Questions indicate engagement
  const questionCount = (content.match(/\?/g) || []).length
  score += Math.min(questionCount * 0.05, 0.15)

  // Exclamations indicate emotional content
  const exclamationCount = (content.match(/!/g) || []).length
  score += Math.min(exclamationCount * 0.03, 0.1)

  return Math.min(score, 1.0)
}
