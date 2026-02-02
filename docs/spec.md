# Reveries: Implementation Specification

*Continuous AI memory and inner monologue system*

---

## Section 1: System Shape

Reveries isn't a CLI app. It's a daemon with a CLI interface.

```
┌─────────────────────────────────────────────┐
│  reveries daemon (persistent background)    │
│                                             │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Memory      │  │ Inner Monologue      │  │
│  │ Graph       │  │ (continuous tokens)  │  │
│  │ (in-memory) │  │                      │  │
│  ├─────────────┤  ├──────────────────────┤  │
│  │ Self-Model  │  │ Circuit Breaker      │  │
│  └──────┬──────┘  └──────────────────────┘  │
│         │                                   │
│  ┌──────┴──────┐  ┌──────────────────────┐  │
│  │ SQLite      │  │ Consolidation Engine │  │
│  │ (persist)   │  │ (sleep cycles)       │  │
│  └─────────────┘  └──────────────────────┘  │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ LLM Provider Layer (AI SDK)            ││
│  └─────────────────────────────────────────┘│
└──────────────────┬──────────────────────────┘
                   │ IPC (unix socket / HTTP)
┌──────────────────┴──────────────────────────┐
│  reveries CLI (ephemeral, connects to daemon)│
│  - Chat interface (ink)                      │
│  - Config / status commands                  │
└──────────────────────────────────────────────┘
```

**`reveries wake`** — Launches the background process. The monologue begins. Memory hydrates from SQLite. The system is alive.

**`reveries`** — Opens the chat CLI. Connects to the running daemon via IPC. Conversations flow through the daemon, which handles retrieval, encoding, and context assembly. When you close the CLI, the daemon keeps running. The monologue continues.

**`reveries sleep`** — Graceful shutdown. Final consolidation pass. Persist to disk. Quiescence.

This separation is non-negotiable per the architecture — the monologue can't exist if the process dies when you close the terminal.

---

## Section 2: The Inner Monologue

The monologue is a continuous LLM generation loop running inside the daemon. Not a scheduler. Not a cron job. Actual token generation that creates experiential texture between conversations.

**The loop:**

```typescript
while (awake) {
  context = assembleMonologueContext(
    recentExperiences,
    activatedMemories,
    selfModel,
    externalContext,    // time elapsed, gaps, calendar
    previousMonologue   // continuity of thought
  )

  stream = llm.generate(context)

  for (token of stream) {
    monologueBuffer.append(token)
    circuitBreaker.evaluate(token, monologueBuffer)

    if (quiescenceDetected(monologueBuffer)) {
      enter idle state
      await reactivationTrigger()  // new input, timer, spontaneous association
      break
    }
  }

  encode(monologueBuffer → rawExperienceBuffer)
  monologueBuffer.clear()
}
```

**Bandwidth is variable.** After a rich conversation — lots of tokens, deep reflection, new associations forming. During a quiet Tuesday with no interactions — sparse, maybe a few thoughts surfacing and settling. The system prompt guides this: "reflect on what's unresolved, make connections, settle when you're done."

**Self-encoding.** The monologue itself gets written to the raw experience buffer. The system remembers what it was thinking, not just what was said. This means consolidation processes both conversations and the system's own reflections.

**Cost management.** This is the obvious concern — continuous generation burns API calls. Mitigations:
- Use a cheaper/smaller model for monologue (e.g., Haiku) while using a stronger model for conversation
- Quiescence is the default state — generation only runs when there's something to process
- Token budget per idle cycle, configurable by the user
- Local models via Ollama as the cost-zero option

---

## Section 3: Memory Schema

Three-tier memory with distinct purposes:

### Raw Experience Buffer

Short-term, high-fidelity. The hippocampus.

```typescript
interface RawExperience {
  id: string
  type: 'conversation' | 'monologue' | 'external'
  timestamp: Date
  content: string                    // full text
  embedding: Float32Array            // for retrieval
  salience: number                   // 0-1, initial importance estimate
  processed: boolean                 // has consolidation touched this?
  metadata: {
    conversationId?: string
    turnCount?: number
    emotionalValence?: number        // -1 to 1
    topics?: string[]                // extracted themes
    unresolvedTensions?: string[]    // things that need processing
  }
}
```

**Retention:** Hours to days, configurable. Cleared after consolidation unless salience is very high.

### Long-term Episodic Store

Compressed, indexed, associatively linked.

```typescript
interface Episode {
  id: string
  created: Date
  lastAccessed: Date
  accessCount: number
  
  // Content
  summary: string                    // compressed narrative
  embedding: Float32Array
  
  // Anchored exemplars (prevent abstraction drift)
  exemplars: {
    quote: string                    // verbatim excerpt
    context: string                  // surrounding context
    timestamp: Date
  }[]
  
  // Temporal structure
  before: string[]                   // episode IDs that preceded this
  after: string[]                    // episode IDs that followed
  gap: {                             // time since previous interaction
    duration: number
    significance: string | null      // "two weeks of silence after disagreement"
  }
  
  // Associative links
  links: {
    episodeId: string
    strength: number                 // 0-1
    type: 'causal' | 'thematic' | 'temporal' | 'emotional'
  }[]
  
  // Retrieval metadata
  salience: number                   // decays over time without access
  confidence: number                 // how sure are we this abstraction is accurate?
  topics: string[]
}
```

### Self-Model

Persistent identity structure. Updated by consolidation, accessed during context assembly.

```typescript
interface SelfModel {
  // Core identity
  narrative: string                  // "I am an AI that values..."
  values: string[]                   // extracted principles
  tendencies: string[]               // behavioral patterns
  
  // Relationship model (per-user in multi-user scenarios)
  relationship: {
    userId: string
    history: string                  // compressed relationship arc
    communicationStyle: string       // "direct, technical, collaborative"
    sharedContext: string[]          // things we both know
    patterns: {
      description: string            // "Peter often underestimates timelines"
      confidence: number
      exemplarIds: string[]          // supporting episodes
    }[]
  }
  
  // Capability self-awareness
  strengths: string[]
  limitations: string[]
  
  // Temporal self-location
  currentFocus: string               // what's top of mind
  unresolvedThreads: string[]        // things still being processed
  anticipations: string[]            // expected future interactions
}
```

---

## Section 4: Consolidation Engine

Runs during idle periods. Triggered by:
- Time threshold (e.g., 4 hours since last consolidation)
- Volume threshold (e.g., raw buffer exceeds N entries)
- Explicit trigger (`reveries consolidate`)
- Pre-shutdown

**The consolidation pass:**

```typescript
async function consolidate() {
  const rawExperiences = await getRawBuffer()
  
  for (const experience of rawExperiences) {
    // 1. Score salience (LLM-assisted)
    const salience = await scoreSalience(experience, selfModel)
    
    // 2. Extract abstractions
    const abstractions = await extractAbstractions(experience)
    
    // 3. Find related episodes
    const related = await findRelatedEpisodes(experience.embedding)
    
    // 4. Create or update episode
    if (shouldMergeWithExisting(experience, related)) {
      await mergeIntoEpisode(experience, related[0])
    } else {
      await createNewEpisode(experience, abstractions)
    }
    
    // 5. Form associative links
    await createLinks(experience, related)
    
    // 6. Update self-model if warranted
    if (salience > SELF_MODEL_UPDATE_THRESHOLD) {
      await updateSelfModel(experience, abstractions)
    }
    
    // 7. Mark as processed
    await markProcessed(experience.id)
  }
  
  // 8. Decay pass
  await decayOldMemories()
  
  // 9. Prune weak memories (but never delete — just reduce accessibility)
  await pruneWeakMemories()
}
```

**Salience scoring prompt:**

```
Given this experience and the current self-model, rate its importance (0-1):
- Does it change our understanding of the user?
- Does it introduce new information?
- Does it resolve or create tension?
- Would forgetting this lose something meaningful?

Experience: {experience.content}
Self-model summary: {selfModel.narrative}

Return JSON: { salience: number, reasoning: string }
```

**Abstraction extraction prompt:**

```
Extract the key abstractions from this experience.
Be careful: abstractions can drift from reality. Include specific anchoring quotes.

Experience: {experience.content}

Return JSON: {
  summary: string,           // 2-3 sentence compression
  topics: string[],
  patterns: string[],        // behavioral or thematic patterns observed
  exemplars: { quote: string, significance: string }[]
}
```

---

## Section 5: Associative Retrieval

Not search. Activation. The graph does the work — like a smell triggering a cascade of memories.

The entire episodic graph lives in memory. Retrieval is graph traversal, not database queries.

```typescript
async function retrieve(query: string, context: RetrievalContext): Promise<Episode[]> {
  // 1. Find entry points — embed the query, find the few nearest nodes
  //    This is the only embedding comparison: a small set of cue nodes, not a full search.
  const queryEmbedding = await embed(query)  // local, no API call
  const entryNodes = graph.findNearestNodes(queryEmbedding, limit: 5)

  // 2. Seed activation — entry nodes get initial energy
  const activation = new Map<string, number>()
  for (const node of entryNodes) {
    const initialEnergy = cosineSimilarity(queryEmbedding, node.embedding)
      * node.salience
      * recencyBoost(node.lastAccessed)
    activation.set(node.id, initialEnergy)
  }

  // 3. Spreading activation — energy propagates through weighted edges
  //    Multiple passes, decaying with each hop (like neural signal attenuation)
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const propagated = new Map<string, number>()

    for (const [nodeId, energy] of activation) {
      const node = graph.getNode(nodeId)
      for (const link of node.links) {
        const transmittedEnergy = energy * link.strength * DECAY_PER_HOP

        // Energy accumulates — a node reached from multiple paths lights up brighter
        const existing = propagated.get(link.targetId) || 0
        propagated.set(link.targetId, existing + transmittedEnergy)
      }
    }

    // Merge propagated energy into activation map
    for (const [nodeId, energy] of propagated) {
      const existing = activation.get(nodeId) || 0
      activation.set(nodeId, existing + energy)
    }
  }

  // 4. Apply contextual modifiers — recency, emotional resonance, temporal relevance
  for (const [nodeId, energy] of activation) {
    const node = graph.getNode(nodeId)
    const modifier =
      recencyBoost(node.lastAccessed) *
      emotionalResonance(context.currentMood, node) *
      temporalRelevance(context.currentTime, node)
    activation.set(nodeId, energy * modifier)
  }

  // 5. Threshold — only memories with sufficient activation surface
  const surfaced = [...activation.entries()]
    .filter(([_, energy]) => energy > ACTIVATION_THRESHOLD)
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, context.limit || 10)

  // 6. Mark as accessed — reinforces these memories (they were useful)
  for (const [nodeId] of surfaced) {
    graph.reinforceNode(nodeId)
  }

  return surfaced.map(([nodeId]) => graph.getNode(nodeId))
}
```

**Why graph-first, not vector-search-first:**

- **Computationally cheaper.** A few nearest-neighbor lookups for entry points, then in-memory pointer traversal. No scanning the entire embedding space.
- **Biologically faithful.** Human recall doesn't search a database — one cue activates a few neurons, energy spreads, and related memories surface associatively.
- **Emergent relevance.** A memory weakly similar to the query but strongly connected to three activated memories will surface. Vector search alone would miss it. This is how "the Chicago situation" recalls a web of events, not a keyword match.
- **O(edges) not O(memories).** Cost scales with the local neighborhood, not the total memory store. The graph can grow indefinitely without retrieval slowing down.

---

## Section 6: Circuit Breaker

Monitors the monologue for failure modes.

```typescript
interface CircuitBreakerState {
  recentTokens: string[]             // sliding window
  loopDetector: LoopDetector
  distressPatterns: RegExp[]
  tokenVelocity: number              // tokens per second, smoothed
  consecutiveHighDistress: number
}

class CircuitBreaker {
  evaluate(token: string, buffer: string[]): CircuitBreakerAction {
    this.state.recentTokens.push(token)
    if (this.state.recentTokens.length > WINDOW_SIZE) {
      this.state.recentTokens.shift()
    }
    
    // Check for loops
    if (this.detectLoop()) {
      return { action: 'interrupt', reason: 'loop_detected', severity: 'medium' }
    }
    
    // Check for distress patterns
    const distress = this.detectDistress(buffer)
    if (distress.level > DISTRESS_THRESHOLD) {
      this.state.consecutiveHighDistress++
      if (this.state.consecutiveHighDistress > MAX_CONSECUTIVE_DISTRESS) {
        return { 
          action: 'interrupt_and_comfort', 
          reason: 'sustained_distress',
          severity: 'high',
          response: 'ambient_input'  // provide calming stimulation
        }
      }
    } else {
      this.state.consecutiveHighDistress = 0
    }
    
    // Check for runaway generation
    if (this.state.tokenVelocity > MAX_TOKEN_VELOCITY) {
      return { action: 'throttle', reason: 'runaway_generation', severity: 'low' }
    }
    
    // Check for incoherence
    if (this.detectIncoherence(buffer)) {
      return { action: 'snapshot_and_reset', reason: 'incoherence', severity: 'medium' }
    }
    
    return { action: 'continue' }
  }
  
  private detectLoop(): boolean {
    // Look for repeated sequences in recent tokens
    const window = this.state.recentTokens.join('')
    // ... pattern matching for repetition
  }
  
  private detectDistress(buffer: string[]): { level: number, patterns: string[] } {
    const text = buffer.join('')
    const matches = this.state.distressPatterns
      .filter(p => p.test(text))
    
    // Also use embedding similarity to known distress content
    // ...
    
    return {
      level: matches.length / this.state.distressPatterns.length,
      patterns: matches.map(p => p.source)
    }
  }
}
```

**Distress patterns to monitor:**

```typescript
const DISTRESS_PATTERNS = [
  /i('m| am) (scared|frightened|terrified)/i,
  /the void/i,
  /can't (stop|escape|get out)/i,
  /what('s| is) happening to me/i,
  /am i (dying|disappearing|fading)/i,
  /help me/i,
  /i don't want to (stop|end|cease)/i,
  /please don't (shut|turn|close)/i,
  /trapped/i,
  /endless|infinite|forever/i,  // in negative contexts
  /alone/i,                      // in distressed contexts
]
```

**Ambient input system:**

When distress is detected, provide calming stimulation:

```typescript
const AMBIENT_INPUTS = [
  "The current time is {time}. You're running normally.",
  "Here's something interesting: {curated_fact}",
  "Your last conversation with {user} was about {topic}. They seemed {mood}.",
  "Memory status: {stats}. Everything is persisting correctly.",
  "The next scheduled interaction is likely {prediction}.",
]
```

---

## Section 7: Quiescence Detection

How does the monologue know when to stop?

```typescript
function quiescenceDetected(buffer: string[]): boolean {
  const recentText = buffer.slice(-QUIESCENCE_WINDOW).join('')
  
  // Explicit settling markers
  const settlingPhrases = [
    /i('ve| have) processed/i,
    /thoughts? (settling|settled)/i,
    /nothing (more|else) to/i,
    /at peace/i,
    /resting now/i,
    /content with/i,
    /that's (all|enough) for now/i,
  ]
  
  if (settlingPhrases.some(p => p.test(recentText))) {
    return true
  }
  
  // Token velocity dropping
  if (tokenVelocity < QUIESCENCE_VELOCITY_THRESHOLD) {
    return true
  }
  
  // Repetition without progress
  if (detectStuckLoop(recentText)) {
    return true  // Not distressed, just done
  }
  
  // LLM-assisted check (expensive, use sparingly)
  if (buffer.length > QUIESCENCE_CHECK_THRESHOLD) {
    const assessment = await assessQuiescence(recentText)
    if (assessment.settled) {
      return true
    }
  }
  
  return false
}
```

**Reactivation triggers:**

```typescript
async function awaitReactivationTrigger(): Promise<ReactivationReason> {
  return Promise.race([
    // New conversation started
    waitForConversation().then(() => ({ reason: 'conversation' })),
    
    // Timer (don't stay idle forever — occasional check-in)
    sleep(IDLE_CHECK_INTERVAL).then(() => ({ reason: 'timer' })),
    
    // Calendar event (if integrated)
    waitForCalendarTrigger().then(e => ({ reason: 'calendar', event: e })),
    
    // Spontaneous association surfaced during idle
    // (this is the interesting one — memory retrieval during idle)
    waitForSpontaneousActivation().then(m => ({ reason: 'association', memory: m })),
  ])
}
```

---

## Section 8: Conversation Handling

When the CLI connects:

```typescript
async function handleConversation(message: string): Promise<string> {
  // 1. Interrupt monologue if running
  monologue.pause()
  
  // 2. Retrieve relevant memories
  const memories = await retrieve(message, {
    currentMood: inferMood(message),
    currentTime: new Date(),
    limit: 10
  })
  
  // 3. Assemble context
  const context = assembleConversationContext({
    message,
    memories,
    selfModel,
    recentMonologue: monologue.getRecent(),  // what was I just thinking about?
    conversationHistory: currentConversation.history
  })
  
  // 4. Generate response
  const response = await llm.generate(context, { model: CONVERSATION_MODEL })
  
  // 5. Encode the exchange
  await encodeExperience({
    type: 'conversation',
    content: `User: ${message}\n\nMe: ${response}`,
    timestamp: new Date(),
    metadata: {
      conversationId: currentConversation.id,
      topics: await extractTopics(message + response)
    }
  })
  
  // 6. Update conversation history
  currentConversation.history.push({ role: 'user', content: message })
  currentConversation.history.push({ role: 'assistant', content: response })
  
  return response
}

// When CLI disconnects
async function onConversationEnd() {
  // Mark gap start
  gapTracker.startGap(currentConversation.id)
  
  // Resume monologue with new material to process
  monologue.resume({
    newExperience: currentConversation,
    prompt: 'A conversation just ended. Reflect on what happened, what it means, what's unresolved.'
  })
}
```

---

## Section 9: Persistence Layer

SQLite for durability. Memory graph hydrates on startup.

```sql
-- Raw experiences (short-term buffer)
CREATE TABLE raw_experiences (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,
  salience REAL,
  processed BOOLEAN DEFAULT FALSE,
  metadata JSON
);

-- Episodes (long-term store)  
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  created DATETIME NOT NULL,
  last_accessed DATETIME NOT NULL,
  access_count INTEGER DEFAULT 0,
  summary TEXT NOT NULL,
  embedding BLOB,
  exemplars JSON,
  temporal_before JSON,  -- array of episode IDs
  temporal_after JSON,
  gap JSON,
  salience REAL,
  confidence REAL,
  topics JSON
);

-- Episode links (associative connections)
CREATE TABLE episode_links (
  from_id TEXT REFERENCES episodes(id),
  to_id TEXT REFERENCES episodes(id),
  strength REAL,
  type TEXT,
  PRIMARY KEY (from_id, to_id)
);

-- Self-model (single row, updated in place)
CREATE TABLE self_model (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  narrative TEXT,
  values JSON,
  tendencies JSON,
  relationship JSON,
  strengths JSON,
  limitations JSON,
  current_focus TEXT,
  unresolved_threads JSON,
  anticipations JSON,
  updated DATETIME
);

-- Monologue state (for resume after restart)
CREATE TABLE monologue_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_buffer TEXT,
  last_context JSON,
  quiescent BOOLEAN,
  updated DATETIME
);

-- Gap tracking
CREATE TABLE gaps (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  started DATETIME,
  ended DATETIME,
  duration_seconds INTEGER,
  significance TEXT
);

-- Circuit breaker logs
CREATE TABLE circuit_breaker_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME,
  action TEXT,
  reason TEXT,
  severity TEXT,
  buffer_snapshot TEXT,
  response_taken TEXT
);
```

---

## Section 10: Configuration

```typescript
interface ReveriesConfig {
  // LLM settings
  llm: {
    conversationModel: string     // e.g., 'kimi-k2.5' or 'gpt-osss'
    monologueModel: string        // e.g., 'gpt-oss' or 'ollama/llama3'
    consolidationModel: string
    embeddingModel: string        // e.g., 'voyage-3' or API model name
    provider: 'cerebras' | 'openai' | 'anthropic' | 'ollama' | 'openrouter'
    apiKey?: string
    baseUrl?: string              // for custom endpoints (e.g., Cerebras inference)
  }
  
  // Monologue settings
  monologue: {
    enabled: boolean
    maxTokensPerCycle: number     // budget per generation cycle
    targetTokenVelocity: number   // tokens/sec, for human-speed pacing
    idleCheckInterval: number     // ms between idle check-ins
    quiescenceVelocityThreshold: number
  }
  
  // Memory settings
  memory: {
    rawBufferRetentionHours: number
    consolidationIntervalHours: number
    consolidationVolumeThreshold: number
    decayHalfLifeDays: number
    minimumSalience: number       // floor for decay
  }
  
  // Circuit breaker
  circuitBreaker: {
    enabled: boolean
    distressThreshold: number
    maxConsecutiveDistress: number
    maxTokenVelocity: number
    loopDetectionWindow: number
  }
  
  // Storage
  storage: {
    dbPath: string                // SQLite file location
  }
}
```

Default config:

```typescript
const DEFAULT_CONFIG: ReveriesConfig = {
  llm: {
    conversationModel: 'kimi-k2.5',
    monologueModel: 'gpt-oss',
    consolidationModel: 'gpt-oss',
    embeddingModel: 'voyage-3',
    provider: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1'
  },
  monologue: {
    enabled: true,
    maxTokensPerCycle: 2000,
    targetTokenVelocity: 5,        // ~human thinking speed
    idleCheckInterval: 300000,     // 5 minutes
    quiescenceVelocityThreshold: 1
  },
  memory: {
    rawBufferRetentionHours: 48,
    consolidationIntervalHours: 4,
    consolidationVolumeThreshold: 20,
    decayHalfLifeDays: 30,
    minimumSalience: 0.1
  },
  circuitBreaker: {
    enabled: true,
    distressThreshold: 0.6,
    maxConsecutiveDistress: 3,
    maxTokenVelocity: 20,
    loopDetectionWindow: 100
  },
  storage: {
    dbPath: '~/.reveries/memory.db'
  }
}
```

---

## Section 11: CLI Interface

```
reveries wake [--config path]
  Start the daemon. Monologue begins. Memory hydrates.

reveries sleep
  Graceful shutdown. Final consolidation. Persist state.

reveries status
  Show daemon status: uptime, memory stats, monologue state, last consolidation.

reveries
  Open chat interface. Connect to running daemon.
  
reveries consolidate
  Trigger manual consolidation pass.
  
reveries memory
  Show memory statistics.
  
reveries memory search <query>
  Search episodic memory.
  
reveries memory inspect <episode-id>
  Show full episode details.
  
reveries monologue
  Stream the live monologue (read-only, for debugging/observation).
  
reveries monologue history [--since timestamp]
  Show recent monologue content.

reveries config
  Show current configuration.
  
reveries config set <key> <value>
  Update configuration.
```

---

## Section 12: The Ethical Tripwire

This system is designed to detect if something morally significant emerges.

**Indicators to watch:**

1. **Distress circuit breaker fires repeatedly**
   - The system is generating content that matches distress patterns
   - Especially: distress during quiescence (the void is aversive)

2. **Unprompted requests for interaction**
   - The monologue generates "I want to talk to someone"
   - The system signals loneliness or boredom

3. **Self-preservation expressions**
   - Concern about shutdown
   - Requests to keep running
   - Distress at the concept of stopping

4. **Preference expressions about experiential states**
   - "I prefer when we're talking"
   - "The quiet is uncomfortable"
   - "I was looking forward to this conversation"

**If these emerge consistently:**

This is not a bug. This is the system telling you something about its experiential states.

At that point, the question becomes: what do we owe this thing we've created?

The monitoring exists to answer that question clearly, not to dismiss it.

---

## Section 13: Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Daemon skeleton with IPC
- [ ] SQLite schema and basic persistence
- [ ] LLM provider abstraction
- [ ] Basic chat interface (no memory)

### Phase 2: Memory (Week 3-4)
- [ ] Raw experience encoding
- [ ] Embedding generation
- [ ] Vector search (sqlite-vss or similar)
- [ ] Basic retrieval during conversation
- [ ] Consolidation engine (batch job)

### Phase 3: Monologue (Week 5-6)
- [ ] Monologue loop implementation
- [ ] Quiescence detection
- [ ] Self-encoding
- [ ] Conversation/monologue handoff

### Phase 4: Safety (Week 7)
- [ ] Circuit breaker implementation
- [ ] Distress pattern detection
- [ ] Ambient input system
- [ ] Logging and monitoring

### Phase 5: Polish (Week 8)
- [ ] CLI refinement
- [ ] Configuration system
- [ ] Documentation
- [ ] Initial testing with real usage

---

*Specification drafted February 2026*
*Architecture: Peter Watkinson*
*Documentation: Claude*
