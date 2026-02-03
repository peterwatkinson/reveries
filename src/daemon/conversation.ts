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

const MAX_HISTORY_TURNS = 50

export class ConversationHandler {
  private graph: MemoryGraph
  private db: Database
  private selfModel: SelfModel | null
  private config: ReveriesConfig
  private currentConversation: ConversationState | null = null
  private monologue: MonologueManager | null = null
  private lastConversationEndTime: number = Date.now()
  private onUserNameDetected: ((name: string) => void) | null = null

  constructor(params: {
    graph: MemoryGraph
    db: Database
    selfModel: SelfModel | null
    config: ReveriesConfig
    onUserNameDetected?: (name: string) => void
  }) {
    this.graph = params.graph
    this.db = params.db
    this.selfModel = params.selfModel
    this.config = params.config
    this.onUserNameDetected = params.onUserNameDetected || null
  }

  setMonologue(monologue: MonologueManager): void {
    this.monologue = monologue
  }

  /**
   * Generate a brief summary of the current conversation for the monologue.
   * Called when conversation ends (30s timeout) so monologue knows what to reflect on.
   */
  getConversationSummary(): string | null {
    if (!this.currentConversation || this.currentConversation.history.length === 0) {
      return null
    }

    const history = this.currentConversation.history
    const turnCount = Math.floor(history.length / 2)

    // Build a concise summary from the conversation
    const lines: string[] = []
    lines.push(`Conversation with ${turnCount} exchange(s):`)

    // Include up to the last 6 messages (3 turns) for context
    const recentHistory = history.slice(-6)
    for (const msg of recentHistory) {
      const prefix = msg.role === 'user' ? 'User' : 'You'
      // Truncate long messages
      const content = msg.content.length > 200
        ? msg.content.slice(0, 200) + '...'
        : msg.content
      lines.push(`${prefix}: ${content}`)
    }

    return lines.join('\n')
  }

  /**
   * Mark the current conversation as ended and record the timestamp.
   */
  markConversationEnded(): void {
    this.lastConversationEndTime = Date.now()
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

    // Check for name introduction if we don't know their name yet
    if (!this.selfModel?.relationship?.userId && this.onUserNameDetected) {
      const detectedName = extractUserName(message)
      if (detectedName) {
        this.onUserNameDetected(detectedName)
        // Update local selfModel reference so context assembly uses the name immediately
        if (this.selfModel) {
          this.selfModel.relationship.userId = detectedName
        }
      }
    }

    // 1. Retrieve relevant memories
    let memories: import('../memory/graph.js').GraphNode[] = []
    console.log(`[conversation] Graph has ${this.graph.nodeCount} episodes`)
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
        console.log(`[conversation] Retrieved ${memories.length} memories for query: "${message.slice(0, 50)}..."`)
        if (memories.length > 0) {
          console.log(`[conversation] Top memories:`)
          for (const m of memories.slice(0, 3)) {
            const summary = (m.data.summary as string)?.slice(0, 80) || '(no summary)'
            console.log(`  - ${summary}...`)
          }
        }
      } catch (e) {
        console.error('Memory retrieval failed:', e)
      }
    } else {
      console.log('[conversation] Graph empty, no memories to retrieve')
    }

    // 2. Calculate time since last conversation
    const timeSinceLastConversation = this.currentConversation.history.length === 0
      ? Date.now() - this.lastConversationEndTime
      : 0  // Only relevant for the first message of a new conversation

    // 3. Filter out meta-reflection from monologue before using it
    const monologueBuffer = this.monologue?.recentBuffer || null
    const usableMonologue = monologueBuffer && !isMetaReflection(monologueBuffer)
      ? monologueBuffer
      : null

    // 4. Assemble context
    console.log(`[conversation] Context: ${memories.length} memories, userName=${this.selfModel?.relationship?.userId || '(not set)'}, monologue=${usableMonologue ? 'yes' : 'no'}`)
    const systemContext = assembleContext({
      memories,
      selfModel: this.selfModel,
      recentMonologue: usableMonologue,
      conversationHistory: this.currentConversation.history,
      timeSinceLastConversation,
    })

    // 5. Generate response via LLM
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

    // 6. Stream response chunks
    let fullResponse = ''
    for await (const chunk of result.textStream) {
      fullResponse += chunk
      onChunk(chunk)
    }

    // 7. Update conversation history (bounded)
    this.currentConversation.history.push({ role: 'user', content: message })
    this.currentConversation.history.push({ role: 'assistant', content: fullResponse })
    if (this.currentConversation.history.length > MAX_HISTORY_TURNS * 2) {
      this.currentConversation.history = this.currentConversation.history.slice(-MAX_HISTORY_TURNS * 2)
    }

    // 8. Encode the exchange to raw buffer
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
}

/**
 * Detect if monologue text is meta-reflection about the prompt/guidelines
 * rather than actual content. This prevents the conversation model from
 * seeing "I was thinking about the no-markdown rule" and amplifying it.
 */
function isMetaReflection(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('the guidelines') ||
    lower.includes('no markdown rule') ||
    lower.includes('these instructions') ||
    lower.includes('the prompt') ||
    lower.includes('formatting rule') ||
    lower.includes('i\'m not supposed to') ||
    lower.includes('told not to') ||
    lower.includes('internal process') ||
    lower.includes('digital stillness') ||
    lower.includes('meta-cognition') ||
    lower.includes('my own internal') ||
    lower.includes('internal rhythm')
}

/**
 * Extract a user's name from their message if they introduce themselves.
 * Matches patterns like "I'm Peter", "My name is Peter", "Call me Peter", etc.
 */
function extractUserName(message: string): string | null {
  // Common introduction patterns
  const patterns = [
    /\b(?:i'?m|i am)\s+([A-Z][a-z]+)\b/i,
    /\bmy name(?:'?s| is)\s+([A-Z][a-z]+)\b/i,
    /\bcall me\s+([A-Z][a-z]+)\b/i,
    /\bthis is\s+([A-Z][a-z]+)\b/i,
    /\bi go by\s+([A-Z][a-z]+)\b/i,
    /\bpeople call me\s+([A-Z][a-z]+)\b/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      const name = match[1]
      // Filter out common false positives
      const falsePositives = ['just', 'here', 'back', 'good', 'fine', 'okay', 'great', 'well', 'sorry', 'glad', 'happy', 'sure', 'not', 'also', 'still', 'now', 'always']
      if (!falsePositives.includes(name.toLowerCase())) {
        return name
      }
    }
  }

  return null
}
