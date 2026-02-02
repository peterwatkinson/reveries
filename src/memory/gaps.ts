import { nanoid } from 'nanoid'
import { Database } from '../storage/database.js'

export interface GapInfo {
  id: string
  conversationId: string
  started: Date
  ended: Date
  durationSeconds: number
  significance: string | null
}

export class GapTracker {
  private db: Database
  private currentGapId: string | null = null
  private currentGapStart: Date | null = null
  private currentConversationId: string | null = null

  constructor(db: Database) {
    this.db = db
  }

  get isGapActive(): boolean {
    return this.currentGapId !== null
  }

  startGap(conversationId: string): void {
    const id = nanoid()
    const started = new Date()

    this.currentGapId = id
    this.currentGapStart = started
    this.currentConversationId = conversationId

    this.db.insertGap({ id, conversationId, started })
  }

  endGap(significance: string | null): GapInfo | null {
    if (!this.currentGapId || !this.currentGapStart) {
      return null
    }

    const ended = new Date()
    const durationSeconds = Math.floor((ended.getTime() - this.currentGapStart.getTime()) / 1000)

    this.db.endGap(this.currentGapId, ended, significance)

    const gap: GapInfo = {
      id: this.currentGapId,
      conversationId: this.currentConversationId!,
      started: this.currentGapStart,
      ended,
      durationSeconds,
      significance,
    }

    this.currentGapId = null
    this.currentGapStart = null
    this.currentConversationId = null

    return gap
  }
}
