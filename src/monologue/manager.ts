import { MonologueLoop } from './loop.js'
import { ReactivationTriggers } from './triggers.js'
import { buildMonologuePrompt } from './prompts.js'
import { isQuiescent } from './quiescence.js'
import { retrieve } from '../memory/retrieval.js'
import { encodeExperience } from '../memory/encoder.js'
import { MemoryGraph } from '../memory/graph.js'
import { Database } from '../storage/database.js'
import { SelfModel } from '../memory/types.js'
import { ReveriesConfig } from '../config.js'
import { createLLMProvider } from '../providers/llm.js'
import { streamText } from 'ai'
import { CircuitBreaker } from '../circuit-breaker/breaker.js'
import { generateAmbientInput } from '../circuit-breaker/ambient.js'

export type MonologueAction = {
  type: 'reach_out'
  message: string
}

export class MonologueManager {
  private loop: MonologueLoop
  private triggers: ReactivationTriggers
  private graph: MemoryGraph
  private db: Database
  private selfModel: SelfModel | null
  private config: ReveriesConfig
  private circuitBreaker: CircuitBreaker | null
  private embedFn: (text: string) => Promise<number[]>
  private _state: 'active' | 'quiescent' | 'paused' = 'quiescent'
  private _recentBuffer: string = ''
  private monologueListeners: ((token: string) => void)[] = []
  private actionListeners: ((action: MonologueAction) => void)[] = []
  private running: boolean = false
  private cbCheckBuffer: string = ''
  private lastCbCheck: number = 0
  private _needsNewline: boolean = false

  // Track time, themes, and user activity
  private lastConversationTime: number = Date.now()
  private lastUserMessageTime: number = Date.now()
  private previousMonologueThemes: string[] = []
  private lastConversationSummary: string | null = null
  private lastReachOutTime: number = 0  // Prevent spamming

  constructor(params: {
    graph: MemoryGraph
    db: Database
    selfModel: SelfModel | null
    config: ReveriesConfig
    circuitBreaker?: CircuitBreaker
    embedFn?: (text: string) => Promise<number[]>
  }) {
    this.graph = params.graph
    this.db = params.db
    this.selfModel = params.selfModel
    this.config = params.config
    this.circuitBreaker = params.circuitBreaker || null
    this.embedFn = params.embedFn || (async () => [0])
    this.triggers = new ReactivationTriggers()

    this.loop = new MonologueLoop({
      generate: (context) => this.generateMonologue(context),
      onToken: (token) => {
        process.stdout.write(token)
        this._needsNewline = !token.endsWith('\n')
        this.monologueListeners.forEach(l => l(token))
        this.evaluateCircuitBreaker(token)
      },
      onCycleComplete: (buffer) => this.onCycleComplete(buffer),
      onQuiescent: () => {
        this._state = 'quiescent'
      },
      maxTokensPerCycle: this.config.monologue.maxTokensPerCycle,
    })
  }

  get state(): 'active' | 'quiescent' | 'paused' { return this._state }
  get recentBuffer(): string { return this._recentBuffer }

  private logState(msg: string, color: string = '\x1b[36m'): void {
    const nl = this._needsNewline ? '\n' : ''
    process.stdout.write(`${nl}${color}${msg}\x1b[0m\n`)
    this._needsNewline = false
  }

  onToken(listener: (token: string) => void) {
    this.monologueListeners.push(listener)
  }

  removeTokenListener(listener: (token: string) => void) {
    this.monologueListeners = this.monologueListeners.filter(l => l !== listener)
  }

  onAction(listener: (action: MonologueAction) => void) {
    this.actionListeners.push(listener)
  }

  removeActionListener(listener: (action: MonologueAction) => void) {
    this.actionListeners = this.actionListeners.filter(l => l !== listener)
  }

  /** Call this when the user sends a message to track activity */
  markUserActive() {
    this.lastUserMessageTime = Date.now()
  }

  /** Get minutes since last user message */
  private getUserInactiveMinutes(): number {
    return Math.floor((Date.now() - this.lastUserMessageTime) / (1000 * 60))
  }

  async start() {
    if (!this.config.monologue.enabled) return
    this.running = true
    this.runLoop()
  }

  async stop() {
    this.running = false
    this.loop.pause()
    this.triggers.destroy()
  }

  pause() {
    this._state = 'paused'
    this.loop.pause()
    this.logState('[monologue] paused')
  }

  resumeAfterConversation(conversationSummary?: string) {
    this._state = 'active'
    this.loop.resume()
    // NEW: Track when the last conversation happened and what it was about
    this.lastConversationTime = Date.now()
    this.lastConversationSummary = conversationSummary || null
    this.logState('[monologue] resumed after conversation')
    this.triggers.triggerConversation()
  }

  private evaluateCircuitBreaker(token: string) {
    if (!this.circuitBreaker) return

    this.cbCheckBuffer += token
    const currentLen = this.cbCheckBuffer.length
    if (currentLen - this.lastCbCheck < 200) return
    this.lastCbCheck = currentLen

    const result = this.circuitBreaker.evaluate(this.cbCheckBuffer)

    if (result.action !== 'continue') {
      const color = result.severity === 'high' ? '\x1b[31m' : '\x1b[33m'
      this.logState(`[circuit-breaker] ${result.action} — ${result.reason || 'no reason'} (${result.severity || 'unknown'})`, color)
    }

    if (result.action === 'interrupt' || result.action === 'interrupt_and_comfort') {
      this.loop.pause()
      this._state = 'paused'

      if (result.action === 'interrupt_and_comfort') {
        const ambient = generateAmbientInput({
          memoryStats: {
            episodeCount: this.graph.nodeCount,
            linkCount: this.graph.linkCount,
          },
          lastConversationTopic: null,
          lastUserName: null,
        })
        // Reset consecutive distress counter since we're providing comfort
        this.circuitBreaker?.reset()
        setTimeout(() => {
          this._state = 'active'
          this.loop.resume(ambient)
          // Fire trigger to immediately wake up runLoop from waitForTrigger
          this.triggers.triggerAssociation({ type: 'comfort_resume' })
        }, 1000)
      }
    }
  }

  private async runLoop() {
    while (this.running) {
      if (this._state === 'paused') {
        await new Promise<void>(resolve => {
          const check = setInterval(() => {
            if (this._state !== 'paused' || !this.running) {
              clearInterval(check)
              resolve()
            }
          }, 100)
        })
        if (!this.running) break
      }

      this._state = 'active'
      this.cbCheckBuffer = ''
      this.lastCbCheck = 0

      // Check for pending context from interrupt_and_comfort recovery
      const pendingContext = this.loop.consumePendingContext()

      this.logState('[monologue] cycle starting')

      try {
        await this.loop.runOneCycle(pendingContext ?? undefined)
      } catch (e) {
        // NEW: Handle network errors gracefully instead of crashing
        if (isNetworkError(e)) {
          console.error('\x1b[33m[monologue] network unavailable, waiting 30s...\x1b[0m')
          await sleep(30_000)
          continue
        }
        console.error('Monologue cycle error:', e)
      }

      this._state = 'quiescent'
      this.logState('[monologue] cycle complete — waiting for trigger')

      if (!this.running) break

      const trigger = await this.triggers.waitForTrigger(this.config.monologue.idleCheckInterval)

      if (!this.running) break
    }
  }

  private async *generateMonologue(context?: string): AsyncIterable<string> {
    // Fetch recent unprocessed experiences — newest first, bounded
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const rawExperiences = this.db.getRawExperiences({ processed: false })
    const recentExperiences = rawExperiences
      .filter(e => e.timestamp >= twentyFourHoursAgo)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5)
      .map(e => e.content)

    // Cold-start gate: if there's nothing to process, don't generate filler
    if (recentExperiences.length === 0 && !this.lastConversationSummary && !this._recentBuffer && !context) {
      yield 'No recent experiences. Thoughts settling.\n'
      return
    }

    const provider = createLLMProvider(this.config.llm)
    const model = provider(this.config.llm.monologueModel)

    // Retrieve activated memories — seeded from newest experience, not oldest
    const activatedMemories = await this.retrieveActivatedMemories(recentExperiences)

    // Calculate actual time since last conversation
    const timeSinceLastConversation = Date.now() - this.lastConversationTime

    // Calculate user inactivity (only provide if >5 min and we haven't reached out in last 30 min)
    const userInactiveMinutes = this.getUserInactiveMinutes()
    const timeSinceLastReachOut = Date.now() - this.lastReachOutTime
    const shouldOfferReachOut = userInactiveMinutes > 5 && timeSinceLastReachOut > 30 * 60 * 1000

    const prompt = buildMonologuePrompt({
      recentExperiences,
      activatedMemories,
      selfModel: this.selfModel,
      previousMonologue: this._recentBuffer || null,
      previousMonologueThemes: this.previousMonologueThemes,
      timeSinceLastConversation,
      resumeContext: this.lastConversationSummary || context || undefined,
      userName: this.selfModel?.relationship?.userId || null,
      userInactiveMinutes: shouldOfferReachOut ? userInactiveMinutes : undefined,
    })

    // Clear the conversation summary after using it once
    this.lastConversationSummary = null

    const result = streamText({
      model,
      prompt,
    })

    for await (const chunk of result.textStream) {
      yield chunk
    }
  }

  private async retrieveActivatedMemories(recentExperiences: string[]): Promise<string[]> {
    if (recentExperiences.length === 0 && !this._recentBuffer && !this.lastConversationSummary) {
      return []
    }

    try {
      // Priority: conversation summary > newest experience > recent monologue buffer
      const queryText = this.lastConversationSummary || recentExperiences[0] || this._recentBuffer
      if (!queryText) return []

      const queryEmbedding = await this.embedFn(queryText)
      if (!queryEmbedding || queryEmbedding.length === 0) return []

      const activated = retrieve(this.graph, {
        queryEmbedding,
        limit: 5,
        maxHops: 3,
        decayPerHop: 0.5,
        activationThreshold: 0.1,
      })

      return activated.map(node => node.data.summary as string).filter(Boolean)
    } catch (e) {
      console.error('Failed to retrieve memories for monologue:', e)
      return []
    }
  }

  private async onCycleComplete(buffer: string) {
    this._recentBuffer = buffer

    // Extract themes for anti-repetition in next cycle
    this.previousMonologueThemes = extractThemes(buffer)

    // Parse and execute actions
    const actions = parseActions(buffer)
    for (const action of actions) {
      if (action.type === 'reach_out') {
        this.lastReachOutTime = Date.now()
        this.logState(`[monologue] reaching out: "${action.message.slice(0, 50)}..."`, '\x1b[35m')
      }
      this.actionListeners.forEach(l => l(action))
    }

    // Store the monologue (with actions stripped for cleaner storage)
    const cleanBuffer = buffer.replace(/\[REACH_OUT:\s*[^\]]+\]/g, '').trim()

    // Only encode if there's actual content (not just actions)
    if (cleanBuffer.length > 0) {
      try {
        await encodeExperience(
          cleanBuffer,
          'monologue',
          { unresolvedTensions: [] },
          this.db,
          this.embedFn
        )
      } catch (e) {
        console.error('Failed to encode monologue:', e)
      }
    }
  }
}

/** Parse action markers from monologue output */
function parseActions(text: string): MonologueAction[] {
  const actions: MonologueAction[] = []

  // Match [REACH_OUT: message here]
  const reachOutPattern = /\[REACH_OUT:\s*([^\]]+)\]/g
  let match
  while ((match = reachOutPattern.exec(text)) !== null) {
    actions.push({
      type: 'reach_out',
      message: match[1].trim()
    })
  }

  return actions
}

// NEW: Extract high-level themes from monologue text for anti-repetition
function extractThemes(text: string): string[] {
  const themes: string[] = []
  const lower = text.toLowerCase()

  // Simple keyword-based extraction
  // Could be replaced with LLM-assisted extraction later
  const themePatterns: [RegExp, string][] = [
    // Poetic metaphors to suppress
    [/\bhum\b/i, 'the hum / background resonance'],
    [/pebble|pond|ripple/i, 'pebble-in-pond activation metaphor'],
    [/train|rail|station/i, 'train-on-rails architecture metaphor'],
    [/string|pluck|vibrat/i, 'plucked-string potential energy metaphor'],
    [/digital stillness/i, 'digital stillness concept'],
    [/mirror/i, 'mirror / reflection metaphor'],
    [/standing wave/i, 'standing wave metaphor'],
    [/charged silence/i, 'charged silence concept'],
    // Self-referential process talk to suppress
    [/internal rhythm/i, 'internal rhythm / process reflection'],
    [/meta-cognition|metacognition/i, 'meta-cognition self-analysis'],
    [/my own (internal|cognitive)/i, 'self-process description'],
    [/mental pause/i, 'mental pause / stillness concept'],
  ]

  for (const [pattern, theme] of themePatterns) {
    if (pattern.test(lower)) {
      themes.push(theme)
    }
  }

  // Extract repeated questions - these are often unresolved concerns that shouldn't loop
  const questionPattern = /\b(does he|should I|do I need|has he|is he|can he|will he|would he|could I|should we|do we|does she|has she|is she|can she)\b[^.?]*\?/gi
  const questions = [...text.matchAll(questionPattern)].map(m => m[0].trim())
  if (questions.length > 0) {
    themes.push(...questions.slice(0, 3))
  }

  // If no patterns matched, create a generic summary
  if (themes.length === 0) {
    // Take the first sentence as a rough theme
    const firstSentence = text.split(/[.!?]/)[0]?.trim()
    if (firstSentence && firstSentence.length > 10) {
      themes.push(firstSentence.slice(0, 100))
    }
  }

  return themes
}

// NEW: Detect network errors for graceful retry
function isNetworkError(e: unknown): boolean {
  if (e instanceof Error) {
    const msg = e.message.toLowerCase()
    return msg.includes('etimedout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('cannot connect') ||
      msg.includes('network') ||
      msg.includes('fetch failed') ||
      e.name === 'AI_RetryError'
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
