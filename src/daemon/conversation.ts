import { streamText } from 'ai'
import { MemoryGraph } from '../memory/graph.js'
import { retrieve } from '../memory/retrieval.js'
import { assembleContext } from '../memory/context.js'
import { encodeExperience } from '../memory/encoder.js'
import { Database } from '../storage/database.js'
import { SelfModel } from '../memory/types.js'
import { ReveriesConfig } from '../config.js'
import { createLLMProvider } from '../providers/llm.js'
import { generateEmbedding } from '../providers/embeddings.js'
import { nanoid } from 'nanoid'
import type { MonologueManager } from '../monologue/manager.js'

export interface ConversationState {
  id: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

export class ConversationHandler {
  private graph: MemoryGraph
  private db: Database
  private selfModel: SelfModel | null
  private config: ReveriesConfig
  private currentConversation: ConversationState | null = null
  private monologue: MonologueManager | null = null

  constructor(params: {
    graph: MemoryGraph
    db: Database
    selfModel: SelfModel | null
    config: ReveriesConfig
  }) {
    this.graph = params.graph
    this.db = params.db
    this.selfModel = params.selfModel
    this.config = params.config
  }

  setMonologue(monologue: MonologueManager): void {
    this.monologue = monologue
  }

  async handleMessage(
    message: string,
    conversationId: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    // Initialize or continue conversation
    if (!this.currentConversation || this.currentConversation.id !== conversationId) {
      this.currentConversation = { id: conversationId, history: [] }
    }

    // 1. Retrieve relevant memories
    let memories: import('../memory/graph.js').GraphNode[] = []
    if (this.graph.nodeCount > 0) {
      try {
        const queryEmbedding = await generateEmbedding(message, this.config.llm.embeddingModel)
        memories = retrieve(this.graph, {
          queryEmbedding,
          limit: 10,
          maxHops: 3,
          decayPerHop: 0.5,
          activationThreshold: 0.01
        })
      } catch (e) {
        // If embedding fails (no API key etc.), continue without memory retrieval
        console.error('Memory retrieval failed:', e)
      }
    }

    // 2. Assemble context
    const systemContext = assembleContext({
      memories,
      selfModel: this.selfModel,
      recentMonologue: this.monologue?.recentBuffer || null,
      conversationHistory: this.currentConversation.history
    })

    // 3. Generate response via LLM
    const provider = createLLMProvider(this.config.llm)
    const model = provider(this.config.llm.conversationModel)

    const result = streamText({
      model,
      system: systemContext,
      messages: [
        ...this.currentConversation.history.map(h => ({
          role: h.role as 'user' | 'assistant',
          content: h.content
        })),
        { role: 'user' as const, content: message }
      ]
    })

    // 4. Stream response chunks
    let fullResponse = ''
    for await (const chunk of result.textStream) {
      fullResponse += chunk
      onChunk(chunk)
    }

    // 5. Update conversation history
    this.currentConversation.history.push({ role: 'user', content: message })
    this.currentConversation.history.push({ role: 'assistant', content: fullResponse })

    // 6. Encode the exchange to raw buffer
    try {
      await encodeExperience(
        `User: ${message}\n\nAssistant: ${fullResponse}`,
        'conversation',
        {
          conversationId: this.currentConversation.id,
          turnCount: this.currentConversation.history.length / 2
        },
        this.db,
        (text) => generateEmbedding(text, this.config.llm.embeddingModel)
      )
    } catch (e) {
      console.error('Failed to encode experience:', e)
    }

    return fullResponse
  }

  endConversation(): void {
    this.currentConversation = null
    // Resume monologue after conversation ends
    if (this.monologue) {
      this.monologue.resumeAfterConversation()
    }
  }
}
