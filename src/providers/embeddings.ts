import { voyage } from 'voyage-ai-provider'
import { embed } from 'ai'

export async function generateEmbedding(
  text: string,
  model: string = 'voyage-3'
): Promise<number[]> {
  const embeddingModel = voyage.textEmbeddingModel(model)
  const result = await embed({ model: embeddingModel, value: text })
  return result.embedding
}
