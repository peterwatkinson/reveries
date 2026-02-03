import { nanoid } from 'nanoid'
import { Database } from '../storage/database.js'
import { MemoryGraph, DecayOptions } from '../memory/graph.js'
import { SelfModel } from '../memory/types.js'
import { persistGraph } from '../memory/hydrator.js'
import { cosineSimilarity } from '../memory/math.js'

interface ConsolidationResult {
  episodes: {
    summary: string
    topics: string[]
    salience: number
    confidence: number
    exemplars: { quote: string; significance: string }[]
    patterns: string[]
  }[]
  selfModelUpdates: {
    currentFocus: string | null
    newTendency: string | null
    newValue: string | null
  }
}

export interface ConsolidationEngineConfig {
  db: Database
  graph: MemoryGraph
  selfModel: SelfModel | null
  consolidateFn: (experiences: string[]) => Promise<ConsolidationResult>
  embedFn: (text: string) => Promise<number[]>
  decayOptions?: DecayOptions
}

export class ConsolidationEngine {
  private db: Database
  private graph: MemoryGraph
  private selfModel: SelfModel | null
  private consolidateFn: (experiences: string[]) => Promise<ConsolidationResult>
  private embedFn: (text: string) => Promise<number[]>
  private decayOptions: DecayOptions

  constructor(config: ConsolidationEngineConfig) {
    this.db = config.db
    this.graph = config.graph
    this.selfModel = config.selfModel
    this.consolidateFn = config.consolidateFn
    this.embedFn = config.embedFn
    this.decayOptions = config.decayOptions || { halfLifeDays: 30, minimumSalience: 0.1 }
  }

  async consolidate(): Promise<void> {
    // 1. Get unprocessed raw experiences
    const raw = this.db.getRawExperiences({ processed: false })

    if (raw.length > 0) {
      // 2. Send to LLM for abstraction
      const contents = raw.map(r => r.content)
      const result = await this.consolidateFn(contents)

      // 3. Create or merge episodes in the graph
      for (const ep of result.episodes) {
        const embedding = await this.embedFn(ep.summary)

        // Check for a highly similar existing episode to merge into
        let merged = false
        if (this.graph.nodeCount > 0) {
          const nearest = this.graph.findNearestNodes(embedding, 1)
          if (nearest.length > 0) {
            const similarity = cosineSimilarity(embedding, nearest[0].embedding)
            if (similarity > 0.85) {
              // Merge into existing episode
              const existing = nearest[0]
              const existingExemplars = (existing.data.exemplars as { quote: string; context: string; timestamp: Date }[]) || []
              const newExemplars = ep.exemplars.map(e => ({
                quote: e.quote,
                context: e.significance,
                timestamp: new Date()
              }))
              existing.data.summary = `${existing.data.summary} ${ep.summary}`
              existing.data.exemplars = [...existingExemplars, ...newExemplars]
              existing.salience = Math.min(1, Math.max(existing.salience, ep.salience))
              this.graph.reinforceNode(existing.id)
              // Strengthen existing links
              const existingLinks = this.graph.getLinks(existing.id)
              for (const link of existingLinks) {
                link.strength = Math.min(1, link.strength + 0.1)
              }
              merged = true
            }
          }
        }

        if (!merged) {
          const id = nanoid()

          this.graph.addNode({
            id,
            type: 'episode',
            embedding,
            salience: ep.salience,
            created: new Date(),
            lastAccessed: new Date(),
            accessCount: 0,
            data: {
              summary: ep.summary,
              topics: ep.topics,
              confidence: ep.confidence,
              exemplars: ep.exemplars.map(e => ({
                quote: e.quote,
                context: e.significance,
                timestamp: new Date()
              })),
              patterns: ep.patterns,
              before: [],
              after: [],
              gap: { duration: 0, significance: null }
            }
          })

          // 4. Find and link related existing episodes
          if (this.graph.nodeCount > 1) {
            const nearest = this.graph.findNearestNodes(embedding, 3)
            for (const neighbor of nearest) {
              if (neighbor.id !== id) {
                this.graph.addLink(id, neighbor.id, 0.5, 'thematic')
              }
            }
          }
        }
      }

      // 5. Update self-model if applicable
      // IMPORTANT: Reload from DB to avoid overwriting fields set by other processes (e.g., CLI)
      if (result.selfModelUpdates) {
        const freshModel = this.db.loadSelfModel()
        if (freshModel) {
          if (result.selfModelUpdates.currentFocus) {
            freshModel.currentFocus = result.selfModelUpdates.currentFocus
          }
          if (result.selfModelUpdates.newTendency && !freshModel.tendencies.includes(result.selfModelUpdates.newTendency)) {
            freshModel.tendencies.push(result.selfModelUpdates.newTendency)
          }
          if (result.selfModelUpdates.newValue && !freshModel.values.includes(result.selfModelUpdates.newValue)) {
            freshModel.values.push(result.selfModelUpdates.newValue)
          }
          this.db.saveSelfModel(freshModel)
          // Update our reference too
          this.selfModel = freshModel
        }
      }

      // 6. Mark raw experiences as processed
      for (const r of raw) {
        this.db.markRawExperienceProcessed(r.id)
      }
    }

    // 7. Decay pass (always runs, even with no new experiences)
    this.graph.applyDecay(this.decayOptions)

    // 8. Persist graph to SQLite
    persistGraph(this.graph, this.db)
  }
}
