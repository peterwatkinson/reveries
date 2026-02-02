import { EventEmitter } from 'events'

export interface ReactivationReason {
  reason: 'conversation' | 'timer' | 'association' | 'calendar'
  data?: unknown
}

export class ReactivationTriggers extends EventEmitter {
  private timerId: NodeJS.Timeout | null = null

  async waitForTrigger(idleCheckInterval: number): Promise<ReactivationReason> {
    return new Promise<ReactivationReason>((resolve) => {
      const cleanup = () => {
        if (this.timerId) {
          clearTimeout(this.timerId)
          this.timerId = null
        }
        this.removeAllListeners('conversation')
        this.removeAllListeners('association')
      }

      // Timer trigger
      this.timerId = setTimeout(() => {
        cleanup()
        resolve({ reason: 'timer' })
      }, idleCheckInterval)

      // Conversation trigger
      this.once('conversation', () => {
        cleanup()
        resolve({ reason: 'conversation' })
      })

      // Spontaneous association trigger
      this.once('association', (data) => {
        cleanup()
        resolve({ reason: 'association', data })
      })
    })
  }

  triggerConversation() {
    this.emit('conversation')
  }

  triggerAssociation(data?: unknown) {
    this.emit('association', data)
  }

  destroy() {
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
    this.removeAllListeners()
  }
}
