import { MonologueLoop } from './loop.js'
import { ReactivationTriggers } from './triggers.js'
import { buildMonologuePrompt } from './prompts.js'
import { isQuiescent } from './quiescence.js'
import { encodeExperience } from '../memory/encoder.js'
import { MemoryGraph } from '../memory/graph.js'
import { Database } from '../storage/database.js'
import { SelfModel } from '../memory/types.js'
import { ReveriesConfig } from '../config.js'
import { createLLMProvider } from '../providers/llm.js'
import { streamText } from 'ai'
import { CircuitBreaker } from '../circuit-breaker/breaker.js'
import { generateAmbientInput } from '../circuit-breaker/ambient.js'

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
  private running: boolean = false
  private cbCheckBuffer: string = ''
  private lastCbCheck: number = 0

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

  // Subscribe to live monologue tokens (for `reveries monologue` command)
  onToken(listener: (token: string) => void) {
    this.monologueListeners.push(listener)
  }

  removeTokenListener(listener: (token: string) => void) {
    this.monologueListeners = this.monologueListeners.filter(l => l !== listener)
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
  }

  resumeAfterConversation(conversationSummary?: string) {
    this._state = 'active'
    this.loop.resume()
    // Trigger the monologue to process the conversation
    this.triggers.triggerConversation()
  }

  private evaluateCircuitBreaker(token: string) {
    if (!this.circuitBreaker) return

    this.cbCheckBuffer += token
    const currentLen = this.cbCheckBuffer.length
    if (currentLen - this.lastCbCheck < 200) return
    this.lastCbCheck = currentLen

    const result = this.circuitBreaker.evaluate(this.cbCheckBuffer)

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
        // Resume with ambient input as context
        setTimeout(() => {
          this._state = 'active'
          this.loop.resume(ambient)
        }, 1000)
      }
    }
  }

  private async runLoop() {
    while (this.running) {
      if (this._state === 'paused') {
        // Wait for resume
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

      try {
        await this.loop.runOneCycle()
      } catch (e) {
        console.error('Monologue cycle error:', e)
      }

      // After cycle, enter quiescence and wait for trigger
      this._state = 'quiescent'

      if (!this.running) break

      const trigger = await this.triggers.waitForTrigger(this.config.monologue.idleCheckInterval)

      if (!this.running) break
    }
  }

  private async *generateMonologue(context?: string): AsyncIterable<string> {
    const provider = createLLMProvider(this.config.llm)
    const model = provider(this.config.llm.monologueModel)

    // Fetch recent unprocessed experiences from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const rawExperiences = this.db.getRawExperiences({ processed: false })
    const recentExperiences = rawExperiences
      .filter(e => e.timestamp >= twentyFourHoursAgo)
      .map(e => e.content)

    const prompt = buildMonologuePrompt({
      recentExperiences,
      activatedMemories: [],
      selfModel: this.selfModel,
      previousMonologue: this._recentBuffer || null,
      timeSinceLastConversation: 0,
      resumeContext: context || undefined,
    })

    const result = streamText({
      model,
      prompt,
    })

    for await (const chunk of result.textStream) {
      yield chunk
    }
  }

  private async onCycleComplete(buffer: string) {
    this._recentBuffer = buffer

    // Encode monologue as raw experience
    try {
      await encodeExperience(
        buffer,
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
