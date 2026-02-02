import { Database } from '../storage/database.js'
import { MemoryGraph } from '../memory/graph.js'
import { hydrateGraph, persistGraph } from '../memory/hydrator.js'
import { SelfModelManager } from '../memory/self-model.js'
import { MonologueManager } from '../monologue/manager.js'
import { ConsolidationEngine } from '../consolidation/engine.js'
import { GapTracker } from '../memory/gaps.js'
import { CircuitBreaker } from '../circuit-breaker/breaker.js'
import { ReveriesConfig, loadConfig } from '../config.js'
import { createLLMProvider } from '../providers/llm.js'
import { generateEmbedding } from '../providers/embeddings.js'
import { generateText } from 'ai'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export class DaemonLifecycle {
  public db!: Database
  public graph!: MemoryGraph
  public selfModelManager!: SelfModelManager
  public monologue!: MonologueManager
  public consolidation!: ConsolidationEngine
  public gapTracker!: GapTracker
  public circuitBreaker!: CircuitBreaker
  public config!: ReveriesConfig

  private consolidationTimer: NodeJS.Timeout | null = null

  async wake(): Promise<void> {
    // 1. Load config
    this.config = loadConfig()

    // 2. Open database
    const dbPath = this.config.storage.dbPath.replace('~', homedir())
    const dbDir = path.dirname(dbPath)
    mkdirSync(dbDir, { recursive: true })
    this.db = new Database(dbPath)

    // 3. Hydrate memory graph
    this.graph = hydrateGraph(this.db)

    // 4. Load/create self-model
    this.selfModelManager = new SelfModelManager(this.db)
    const selfModel = this.selfModelManager.getOrCreate()

    // 5. Create circuit breaker
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker, this.db)

    // 6. Create gap tracker
    this.gapTracker = new GapTracker(this.db)

    // 7. Create consolidation engine
    this.consolidation = new ConsolidationEngine({
      db: this.db,
      graph: this.graph,
      selfModel,
      consolidateFn: async (experiences) => {
        // Use LLM for abstraction
        try {
          const provider = createLLMProvider(this.config.llm)
          const model = provider(this.config.llm.consolidationModel)
          const { text } = await generateText({
            model,
            prompt: `Extract the key abstractions from these experiences. Be careful: abstractions can drift from reality. Include specific anchoring quotes.

Experiences:
${experiences.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Return JSON only: {
  "episodes": [{
    "summary": "2-3 sentence compression",
    "topics": ["topic1"],
    "salience": 0.0-1.0,
    "confidence": 0.0-1.0,
    "exemplars": [{ "quote": "exact quote", "significance": "why it matters" }],
    "patterns": ["behavioral or thematic pattern observed"]
  }],
  "selfModelUpdates": {
    "currentFocus": "string or null",
    "newTendency": "string or null",
    "newValue": "string or null"
  }
}`
          })
          return JSON.parse(text)
        } catch (e) {
          console.error('Consolidation LLM call failed:', e)
          return { episodes: [], selfModelUpdates: { currentFocus: null, newTendency: null, newValue: null } }
        }
      },
      embedFn: (text) => generateEmbedding(text, this.config.llm.embeddingModel),
      decayOptions: {
        halfLifeDays: this.config.memory.decayHalfLifeDays,
        minimumSalience: this.config.memory.minimumSalience
      }
    })

    // 8. Create monologue manager
    this.monologue = new MonologueManager({
      graph: this.graph,
      db: this.db,
      selfModel,
      config: this.config
    })

    // 9. Schedule consolidation
    this.scheduleConsolidation()
  }

  async sleep(): Promise<void> {
    // 1. Stop consolidation timer
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer)
      this.consolidationTimer = null
    }

    // 2. Stop monologue
    await this.monologue.stop()

    // 3. Run final consolidation
    try {
      await this.consolidation.consolidate()
    } catch (e) {
      console.error('Final consolidation failed:', e)
    }

    // 4. Persist graph
    persistGraph(this.graph, this.db)

    // 5. Close database
    this.db.close()
  }

  private scheduleConsolidation(): void {
    const intervalMs = this.config.memory.consolidationIntervalHours * 60 * 60 * 1000
    this.consolidationTimer = setInterval(async () => {
      try {
        await this.consolidation.consolidate()
      } catch (e) {
        console.error('Scheduled consolidation failed:', e)
      }
    }, intervalMs)
  }
}
