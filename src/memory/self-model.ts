import { Database } from '../storage/database.js'
import { SelfModel } from './types.js'

export interface SelfModelUpdate {
  currentFocus: string | null
  newTendency: string | null
  newValue: string | null
}

export class SelfModelManager {
  private db: Database
  private cached: SelfModel | null = null

  constructor(db: Database) {
    this.db = db
  }

  getOrCreate(): SelfModel {
    if (this.cached) return this.cached

    const loaded = this.db.loadSelfModel()
    if (loaded) {
      this.cached = loaded
      return loaded
    }

    // Initialize blank
    const blank: SelfModel = {
      narrative: '',
      values: [],
      tendencies: [],
      relationship: {
        userId: '',
        history: '',
        communicationStyle: '',
        sharedContext: [],
        patterns: []
      },
      strengths: [],
      limitations: [],
      currentFocus: '',
      unresolvedThreads: [],
      anticipations: []
    }

    this.db.saveSelfModel(blank)
    this.cached = blank
    return blank
  }

  save(model: SelfModel): void {
    this.db.saveSelfModel(model)
    this.cached = model
  }

  mergeUpdate(update: SelfModelUpdate): void {
    const model = this.getOrCreate()

    if (update.currentFocus) {
      model.currentFocus = update.currentFocus
    }

    if (update.newTendency && !model.tendencies.includes(update.newTendency)) {
      model.tendencies.push(update.newTendency)
    }

    if (update.newValue && !model.values.includes(update.newValue)) {
      model.values.push(update.newValue)
    }

    this.save(model)
  }
}
