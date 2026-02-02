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

  constructor(config: MonologueLoopConfig) {
    this.config = config
  }

  get isPaused(): boolean { return this._isPaused }
  get isRunning(): boolean { return this._isRunning }

  pause() { this._isPaused = true }

  resume(context?: string) {
    this._isPaused = false
    // context can be used to inform the next cycle
  }

  async runOneCycle(context?: string): Promise<void> {
    this._isRunning = true
    this.buffer = ''
    this.lastQuiescenceCheck = 0
    let charCount = 0

    try {
      const stream = this.config.generate(context)
      for await (const token of stream) {
        if (this._isPaused) break

        this.buffer += token
        charCount += token.length
        this.config.onToken(token)

        if (charCount >= this.config.maxTokensPerCycle) break

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
