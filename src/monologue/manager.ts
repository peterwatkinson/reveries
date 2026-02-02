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

export class MonologueManager {
  private loop: MonologueLoop
  private triggers: ReactivationTriggers
  private graph: MemoryGraph
  private db: Database
  private selfModel: SelfModel | null
  private config: ReveriesConfig
  private _state: 'active' | 'quiescent' | 'paused' = 'quiescent'
  private _recentBuffer: string = ''
  private monologueListeners: ((token: string) => void)[] = []
  private running: boolean = false

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
    this.triggers = new ReactivationTriggers()

    this.loop = new MonologueLoop({
      generate: (context) => this.generateMonologue(context),
      onToken: (token) => {
        this.monologueListeners.forEach(l => l(token))
      },
      onCycleComplete: (buffer) => this.onCycleComplete(buffer),
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

    const prompt = buildMonologuePrompt({
      recentExperiences: [], // TODO: get from raw buffer
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
        async () => [0] // Placeholder embedding — will use real one when consolidation processes it
      )
    } catch (e) {
      console.error('Failed to encode monologue:', e)
    }
  }
}
