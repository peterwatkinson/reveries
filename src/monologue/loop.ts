import { isQuiescent } from './quiescence.js'

export interface MonologueLoopConfig {
  generate: (context?: string) => AsyncIterable<string>
  onToken: (token: string) => void
  onCycleComplete: (buffer: string) => void
  onQuiescent?: () => void
  maxTokensPerCycle: number
}

export class MonologueLoop {
  private config: MonologueLoopConfig
  private _isPaused: boolean = false
  private _isRunning: boolean = false
  private buffer: string = ''
  private lastQuiescenceCheck: number = 0
  private _pendingContext: string | null = null

  constructor(config: MonologueLoopConfig) {
    this.config = config
  }

  get isPaused(): boolean { return this._isPaused }
  get isRunning(): boolean { return this._isRunning }

  pause() { this._isPaused = true }

  resume(context?: string) {
    this._isPaused = false
    // Store context to be used in the next cycle
    if (context) {
      this._pendingContext = context
    }
  }

  consumePendingContext(): string | null {
    const ctx = this._pendingContext
    this._pendingContext = null
    return ctx
  }

  async runOneCycle(context?: string): Promise<void> {
    this._isRunning = true
    this._isPaused = false
    this.buffer = ''
    this.lastQuiescenceCheck = 0
    let charCount = 0
    let overBudget = false

    try {
      const stream = this.config.generate(context)
      for await (const token of stream) {
        if (this._isPaused) break

        this.buffer += token
        charCount += token.length
        this.config.onToken(token)

        if (this._isPaused) break

        // Once over budget, continue until we hit a sentence boundary
        if (charCount >= this.config.maxTokensPerCycle) {
          overBudget = true
        }

        if (overBudget) {
          // Stop at sentence-ending punctuation followed by space/newline, or double newline
          const tail = this.buffer.slice(-10)
          if (/[.!?]\s*$/.test(tail) || /\n\n$/.test(tail)) {
            break
          }
          // Hard limit: don't let it run forever (50% overage max)
          if (charCount >= this.config.maxTokensPerCycle * 1.5) {
            break
          }
        }

        // Check for quiescence every 200 chars
        if (charCount - this.lastQuiescenceCheck >= 200) {
          this.lastQuiescenceCheck = charCount
          if (isQuiescent(this.buffer)) {
            this.config.onQuiescent?.()
            break
          }
        }
      }
    } finally {
      this._isRunning = false
      if (this.buffer.length > 0) {
        this.config.onCycleComplete(this.buffer)
      }
    }
  }

  getRecentBuffer(): string {
    return this.buffer
  }
}
