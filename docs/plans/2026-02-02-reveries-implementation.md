# Reveries Implementation Plan

**Goal:** Build a daemon-based CLI chat application with biologically-inspired episodic memory, inner monologue, and associative retrieval.

**Architecture:** A persistent Node.js daemon manages the memory graph, inner monologue, and consolidation engine. A CLI client connects via Unix socket IPC to chat. The daemon stays alive between conversations -- the monologue continues. Memory is an in-memory graph backed by SQLite. Retrieval is activation-spreading, not vector search.

**Tech Stack:** TypeScript, Node.js, Vercel AI SDK (`ai`), `better-sqlite3`, `voyage-ai-provider` for embeddings, Commander.js for CLI routing.

**Reference:** See `docs/design.md` and `docs/spec.md`.

---

## Phase 1: Project Scaffold & Daemon

### Task 1: Initialize the TypeScript project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`

**Step 1: Initialize npm project**

Run: `cd /Users/peterwatkinson/Documents/GitHub/reveries && npm init -y`

**Step 2: Install core dependencies**

Run:
```bash
npm install typescript @types/node tsx commander better-sqlite3 @types/better-sqlite3 ai @ai-sdk/openai voyage-ai-provider ink react @types/react nanoid
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create entry point stub**

Create `src/index.ts`:
```typescript
#!/usr/bin/env node
console.log('reveries')
```

**Step 5: Add scripts to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

**Step 6: Verify it runs**

Run: `npx tsx src/index.ts`
Expected: prints `reveries`

**Step 7: Commit**

```bash
git init && git add -A && git commit -m "feat: initialize reveries project"
```

---

### Task 2: Create the project directory structure

**Files:**
- Create: `src/daemon/index.ts`
- Create: `src/cli/index.ts`
- Create: `src/memory/graph.ts`
- Create: `src/memory/types.ts`
- Create: `src/monologue/index.ts`
- Create: `src/consolidation/index.ts`
- Create: `src/providers/index.ts`
- Create: `src/storage/index.ts`
- Create: `src/circuit-breaker/index.ts`
- Create: `src/config.ts`

**Step 1: Create directory structure with stub files**

Each file exports an empty placeholder. Example for each:

`src/config.ts`:
```typescript
export interface ReveriesConfig {
  llm: {
    conversationModel: string
    monologueModel: string
    consolidationModel: string
    embeddingModel: string
    provider: 'cerebras' | 'openai' | 'anthropic' | 'ollama' | 'openrouter'
    apiKey?: string
    baseUrl?: string
  }
  monologue: {
    enabled: boolean
    maxTokensPerCycle: number
    targetTokenVelocity: number
    idleCheckInterval: number
    quiescenceVelocityThreshold: number
  }
  memory: {
    rawBufferRetentionHours: number
    consolidationIntervalHours: number
    consolidationVolumeThreshold: number
    decayHalfLifeDays: number
    minimumSalience: number
  }
  circuitBreaker: {
    enabled: boolean
    distressThreshold: number
    maxConsecutiveDistress: number
    maxTokenVelocity: number
    loopDetectionWindow: number
  }
  storage: {
    dbPath: string
  }
}

export const DEFAULT_CONFIG: ReveriesConfig = {
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
    targetTokenVelocity: 5,
    idleCheckInterval: 300000,
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

export function loadConfig(): ReveriesConfig {
  // TODO: load from ~/.reveries/config.json, merge with defaults
  return DEFAULT_CONFIG
}
```

`src/memory/types.ts`:
```typescript
export interface RawExperience {
  id: string
  type: 'conversation' | 'monologue' | 'external'
  timestamp: Date
  content: string
  embedding: number[]
  salience: number
  processed: boolean
  metadata: {
    conversationId?: string
    turnCount?: number
    emotionalValence?: number
    topics?: string[]
    unresolvedTensions?: string[]
  }
}

export interface Episode {
  id: string
  created: Date
  lastAccessed: Date
  accessCount: number
  summary: string
  embedding: number[]
  exemplars: {
    quote: string
    context: string
    timestamp: Date
  }[]
  before: string[]
  after: string[]
  gap: {
    duration: number
    significance: string | null
  }
  links: EpisodeLink[]
  salience: number
  confidence: number
  topics: string[]
}

export interface EpisodeLink {
  targetId: string
  strength: number
  type: 'causal' | 'thematic' | 'temporal' | 'emotional'
}

export interface SelfModel {
  narrative: string
  values: string[]
  tendencies: string[]
  relationship: {
    userId: string
    history: string
    communicationStyle: string
    sharedContext: string[]
    patterns: {
      description: string
      confidence: number
      exemplarIds: string[]
    }[]
  }
  strengths: string[]
  limitations: string[]
  currentFocus: string
  unresolvedThreads: string[]
  anticipations: string[]
}
```

All other stub files export `// TODO` placeholder.

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: create project directory structure and type definitions"
```

---

### Task 3: SQLite persistence layer

**Files:**
- Create: `src/storage/database.ts`
- Create: `src/storage/migrations.ts`
- Test: `src/storage/__tests__/database.test.ts`

**Step 1: Write failing test**

Install vitest: `npm install -D vitest`

Create `src/storage/__tests__/database.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '../database.js'
import { unlinkSync, existsSync } from 'fs'

const TEST_DB = '/tmp/reveries-test.db'

describe('Database', () => {
  let db: Database

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  })

  it('creates tables on init', () => {
    const tables = db.listTables()
    expect(tables).toContain('raw_experiences')
    expect(tables).toContain('episodes')
    expect(tables).toContain('episode_links')
    expect(tables).toContain('self_model')
    expect(tables).toContain('monologue_state')
    expect(tables).toContain('gaps')
    expect(tables).toContain('circuit_breaker_events')
  })

  it('inserts and retrieves a raw experience', () => {
    db.insertRawExperience({
      id: 'test-1',
      type: 'conversation',
      timestamp: new Date('2026-01-01'),
      content: 'Hello world',
      embedding: [0.1, 0.2, 0.3],
      salience: 0.5,
      processed: false,
      metadata: { topics: ['greeting'] }
    })

    const result = db.getRawExperiences({ processed: false })
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Hello world')
    expect(result[0].salience).toBe(0.5)
  })

  it('inserts and retrieves an episode', () => {
    db.insertEpisode({
      id: 'ep-1',
      created: new Date('2026-01-01'),
      lastAccessed: new Date('2026-01-01'),
      accessCount: 0,
      summary: 'User introduced themselves',
      embedding: [0.1, 0.2],
      exemplars: [{ quote: 'Hi, I am Peter', context: 'first message', timestamp: new Date() }],
      before: [],
      after: [],
      gap: { duration: 0, significance: null },
      links: [],
      salience: 0.8,
      confidence: 0.9,
      topics: ['introduction']
    })

    const result = db.getEpisode('ep-1')
    expect(result).not.toBeNull()
    expect(result!.summary).toBe('User introduced themselves')
  })

  it('inserts and retrieves episode links', () => {
    // Create two episodes first
    const baseEpisode = {
      created: new Date(), lastAccessed: new Date(), accessCount: 0,
      summary: 'test', embedding: [0.1], exemplars: [],
      before: [], after: [], gap: { duration: 0, significance: null },
      links: [], salience: 0.5, confidence: 0.5, topics: []
    }
    db.insertEpisode({ ...baseEpisode, id: 'ep-1' })
    db.insertEpisode({ ...baseEpisode, id: 'ep-2' })

    db.insertEpisodeLink('ep-1', 'ep-2', 0.7, 'thematic')

    const links = db.getEpisodeLinks('ep-1')
    expect(links).toHaveLength(1)
    expect(links[0].targetId).toBe('ep-2')
    expect(links[0].strength).toBe(0.7)
  })

  it('loads and saves self model', () => {
    const model = {
      narrative: 'I am Reveries',
      values: ['curiosity'],
      tendencies: ['thorough'],
      relationship: {
        userId: 'peter',
        history: 'We are building together',
        communicationStyle: 'direct',
        sharedContext: ['reveries project'],
        patterns: []
      },
      strengths: ['memory'],
      limitations: ['no senses'],
      currentFocus: 'building memory system',
      unresolvedThreads: [],
      anticipations: []
    }

    db.saveSelfModel(model)
    const loaded = db.loadSelfModel()
    expect(loaded).not.toBeNull()
    expect(loaded!.narrative).toBe('I am Reveries')
    expect(loaded!.values).toEqual(['curiosity'])
  })
})
```

**Step 2: Run test to verify it fails**

Add to `package.json` scripts: `"test": "vitest run"`

Run: `npx vitest run src/storage/__tests__/database.test.ts`
Expected: FAIL — module not found

**Step 3: Implement Database class**

Create `src/storage/database.ts` implementing all the methods tested above. Use `better-sqlite3`. Schema from spec Section 9. Serialize embeddings as JSON arrays in BLOB columns. Serialize complex objects as JSON.

Key methods:
- `constructor(dbPath: string)` — opens DB, runs migrations
- `listTables(): string[]`
- `insertRawExperience(exp: RawExperience): void`
- `getRawExperiences(filter: { processed?: boolean }): RawExperience[]`
- `markRawExperienceProcessed(id: string): void`
- `insertEpisode(ep: Episode): void`
- `getEpisode(id: string): Episode | null`
- `getAllEpisodes(): Episode[]`
- `updateEpisodeSalience(id: string, salience: number): void`
- `updateEpisodeAccess(id: string): void`
- `insertEpisodeLink(fromId: string, toId: string, strength: number, type: string): void`
- `getEpisodeLinks(episodeId: string): EpisodeLink[]`
- `updateLinkStrength(fromId: string, toId: string, strength: number): void`
- `saveSelfModel(model: SelfModel): void`
- `loadSelfModel(): SelfModel | null`
- `saveMonologueState(state: { lastBuffer: string, lastContext: object, quiescent: boolean }): void`
- `loadMonologueState(): { lastBuffer: string, lastContext: object, quiescent: boolean } | null`
- `insertGap(gap: { id: string, conversationId: string, started: Date }): void`
- `endGap(id: string, ended: Date, significance: string | null): void`
- `logCircuitBreakerEvent(event: object): void`
- `close(): void`

**Step 4: Run tests**

Run: `npx vitest run src/storage/__tests__/database.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: SQLite persistence layer with full schema"
```

---

### Task 4: Daemon skeleton with IPC

**Files:**
- Create: `src/daemon/server.ts`
- Create: `src/daemon/client.ts`
- Create: `src/daemon/protocol.ts`
- Test: `src/daemon/__tests__/ipc.test.ts`

**Step 1: Define the IPC protocol**

Create `src/daemon/protocol.ts`:
```typescript
export type DaemonRequest =
  | { type: 'chat'; message: string; conversationId: string }
  | { type: 'status' }
  | { type: 'consolidate' }
  | { type: 'monologue-stream' }
  | { type: 'memory-stats' }
  | { type: 'memory-search'; query: string }

export type DaemonResponse =
  | { type: 'chat-chunk'; content: string }
  | { type: 'chat-done' }
  | { type: 'status'; data: DaemonStatus }
  | { type: 'monologue-chunk'; content: string }
  | { type: 'error'; message: string }
  | { type: 'ok'; data?: unknown }

export interface DaemonStatus {
  uptime: number
  monologueState: 'active' | 'quiescent' | 'paused'
  memoryStats: {
    rawBufferCount: number
    episodeCount: number
    linkCount: number
  }
  lastConsolidation: string | null
}

export const SOCKET_PATH = '/tmp/reveries.sock'
```

**Step 2: Write failing test**

Create `src/daemon/__tests__/ipc.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DaemonServer } from '../server.js'
import { DaemonClient } from '../client.js'
import { SOCKET_PATH } from '../protocol.js'
import { unlinkSync, existsSync } from 'fs'

describe('Daemon IPC', () => {
  let server: DaemonServer
  let client: DaemonClient

  beforeAll(async () => {
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
    server = new DaemonServer()
    await server.start()
    client = new DaemonClient()
    await client.connect()
  })

  afterAll(async () => {
    await client.disconnect()
    await server.stop()
  })

  it('responds to status request', async () => {
    const status = await client.status()
    expect(status).toHaveProperty('uptime')
    expect(status).toHaveProperty('monologueState')
    expect(status).toHaveProperty('memoryStats')
  })
})
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run src/daemon/__tests__/ipc.test.ts`
Expected: FAIL

**Step 4: Implement DaemonServer**

Create `src/daemon/server.ts`: Node.js `net.createServer` listening on Unix socket. Handles newline-delimited JSON messages. Routes requests by type. For now, `status` returns uptime and placeholder stats.

**Step 5: Implement DaemonClient**

Create `src/daemon/client.ts`: `net.connect` to Unix socket. Sends JSON messages, receives responses. `status()` method sends status request and returns parsed response.

**Step 6: Run tests**

Run: `npx vitest run src/daemon/__tests__/ipc.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: daemon IPC server and client over Unix socket"
```

---

### Task 5: CLI routing with Commander

**Files:**
- Modify: `src/index.ts`
- Create: `src/cli/commands.ts`

**Step 1: Implement CLI commands**

Wire up Commander.js in `src/index.ts` with the following commands from the spec:
- `reveries wake` — starts daemon (fork a detached child process)
- `reveries sleep` — sends shutdown signal to daemon
- `reveries status` — queries daemon status, prints it
- `reveries` (default) — opens chat interface (placeholder for now: "connecting to daemon...")
- `reveries consolidate` — triggers manual consolidation
- `reveries memory` — shows memory stats
- `reveries monologue` — streams live monologue

For now, `wake` should fork the daemon process using `child_process.fork` with `detached: true` and `stdio: 'ignore'`, then `unref()` so the CLI can exit while the daemon runs.

**Step 2: Test manually**

Run: `npx tsx src/index.ts wake`
Expected: daemon starts, prints PID, CLI exits

Run: `npx tsx src/index.ts status`
Expected: prints daemon status JSON

Run: `npx tsx src/index.ts sleep`
Expected: daemon shuts down gracefully

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: CLI routing with wake/sleep/status commands"
```

---

### Task 6: LLM provider abstraction

**Files:**
- Create: `src/providers/llm.ts`
- Create: `src/providers/embeddings.ts`
- Test: `src/providers/__tests__/llm.test.ts`

**Step 1: Write provider abstraction**

`src/providers/llm.ts`:
```typescript
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, streamText } from 'ai'
import { ReveriesConfig } from '../config.js'

export function createLLMProvider(config: ReveriesConfig['llm']) {
  // Cerebras, OpenAI, Ollama, OpenRouter all use OpenAI-compatible format
  // Anthropic uses its own format
  if (config.provider === 'anthropic') {
    // Use @ai-sdk/anthropic
    throw new Error('Anthropic provider not yet implemented')
  }

  return createOpenAI({
    apiKey: config.apiKey || process.env.CEREBRAS_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: config.baseUrl || 'https://api.cerebras.ai/v1',
    compatibility: 'compatible'
  })
}
```

`src/providers/embeddings.ts`:
```typescript
import { voyage } from 'voyage-ai-provider'
import { embed } from 'ai'

export async function generateEmbedding(
  text: string,
  model: string = 'voyage-3'
): Promise<number[]> {
  const embeddingModel = voyage.textEmbeddingModel(model)
  const result = await embed({ model: embeddingModel, value: text })
  return result.embedding
}
```

**Step 2: Write integration test (skipped without API key)**

```typescript
import { describe, it, expect } from 'vitest'
import { generateEmbedding } from '../embeddings.js'

describe('Embeddings', () => {
  it.skipIf(!process.env.VOYAGE_API_KEY)('generates an embedding', async () => {
    const result = await generateEmbedding('hello world')
    expect(result.length).toBeGreaterThan(0)
    expect(typeof result[0]).toBe('number')
  })
})
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: LLM provider abstraction with Cerebras and Voyage embeddings"
```

---

## Phase 2: Memory Graph

### Task 7: In-memory graph engine

**Files:**
- Create: `src/memory/graph.ts`
- Test: `src/memory/__tests__/graph.test.ts`

This is the core of Reveries. The graph lives in memory. Retrieval is activation spreading.

**Step 1: Write failing tests**

Create `src/memory/__tests__/graph.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryGraph } from '../graph.js'

describe('MemoryGraph', () => {
  let graph: MemoryGraph

  beforeEach(() => {
    graph = new MemoryGraph()
  })

  it('adds and retrieves nodes', () => {
    graph.addNode({
      id: 'ep-1',
      type: 'episode',
      embedding: [1, 0, 0],
      salience: 0.8,
      lastAccessed: new Date(),
      accessCount: 0,
      data: { summary: 'test episode' }
    })

    const node = graph.getNode('ep-1')
    expect(node).not.toBeNull()
    expect(node!.data.summary).toBe('test episode')
  })

  it('adds and retrieves links', () => {
    graph.addNode({ id: 'a', type: 'episode', embedding: [1, 0], salience: 0.5, lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0, 1], salience: 0.5, lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addLink('a', 'b', 0.8, 'thematic')

    const links = graph.getLinks('a')
    expect(links).toHaveLength(1)
    expect(links[0].targetId).toBe('b')
  })

  it('finds nearest nodes by embedding', () => {
    graph.addNode({ id: 'a', type: 'episode', embedding: [1, 0, 0], salience: 0.5, lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0, 1, 0], salience: 0.5, lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'c', type: 'episode', embedding: [0.9, 0.1, 0], salience: 0.5, lastAccessed: new Date(), accessCount: 0, data: {} })

    const nearest = graph.findNearestNodes([1, 0, 0], 2)
    expect(nearest[0].id).toBe('a')
    expect(nearest[1].id).toBe('c')
  })

  it('performs spreading activation', () => {
    // A -> B -> C chain
    graph.addNode({ id: 'a', type: 'episode', embedding: [1, 0], salience: 0.8, lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0.5, 0.5], salience: 0.6, lastAccessed: new Date(), accessCount: 0, data: {} })
    graph.addNode({ id: 'c', type: 'episode', embedding: [0, 1], salience: 0.7, lastAccessed: new Date(), accessCount: 0, data: {} })

    graph.addLink('a', 'b', 0.9, 'causal')
    graph.addLink('b', 'c', 0.8, 'causal')

    // Activate node A and spread
    const activations = graph.spreadActivation(
      new Map([['a', 1.0]]),
      { maxHops: 2, decayPerHop: 0.5 }
    )

    // A should have highest, C should still be activated via B
    expect(activations.get('a')).toBeGreaterThan(0)
    expect(activations.get('b')).toBeGreaterThan(0)
    expect(activations.get('c')).toBeGreaterThan(0)
    // Energy decays: a > b > c
    expect(activations.get('a')!).toBeGreaterThan(activations.get('b')!)
    expect(activations.get('b')!).toBeGreaterThan(activations.get('c')!)
  })

  it('reinforces nodes on access', () => {
    graph.addNode({ id: 'a', type: 'episode', embedding: [1], salience: 0.5, lastAccessed: new Date('2026-01-01'), accessCount: 0, data: {} })

    graph.reinforceNode('a')
    const node = graph.getNode('a')!
    expect(node.accessCount).toBe(1)
    expect(node.lastAccessed.getTime()).toBeGreaterThan(new Date('2026-01-01').getTime())
  })

  it('applies decay', () => {
    graph.addNode({ id: 'a', type: 'episode', embedding: [1], salience: 0.8, lastAccessed: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), accessCount: 0, data: {} })
    graph.addNode({ id: 'b', type: 'episode', embedding: [0, 1], salience: 0.8, lastAccessed: new Date(), accessCount: 5, data: {} })

    graph.applyDecay({ halfLifeDays: 30, minimumSalience: 0.1 })

    // 'a' not accessed in 90 days (3 half-lives) should have decayed significantly
    const a = graph.getNode('a')!
    expect(a.salience).toBeLessThan(0.2)
    expect(a.salience).toBeGreaterThanOrEqual(0.1) // floor

    // 'b' recently accessed should barely decay
    const b = graph.getNode('b')!
    expect(b.salience).toBeGreaterThan(0.7)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/memory/__tests__/graph.test.ts`
Expected: FAIL

**Step 3: Implement MemoryGraph**

Create `src/memory/graph.ts`. Key implementation details:
- Nodes stored in a `Map<string, GraphNode>`
- Links stored in a `Map<string, GraphLink[]>` (adjacency list)
- `findNearestNodes` does cosine similarity against all nodes (fine for thousands of nodes in-memory)
- `spreadActivation` iterates `maxHops` times, propagating energy along weighted edges with decay
- `applyDecay` uses exponential decay: `salience * Math.pow(0.5, daysSinceAccess / halfLifeDays)`, floored at `minimumSalience`
- `reinforceNode` increments accessCount and updates lastAccessed

**Step 4: Run tests**

Run: `npx vitest run src/memory/__tests__/graph.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: in-memory graph engine with spreading activation and decay"
```

---

### Task 8: Graph hydration from SQLite

**Files:**
- Create: `src/memory/hydrator.ts`
- Test: `src/memory/__tests__/hydrator.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '../../storage/database.js'
import { MemoryGraph } from '../graph.js'
import { hydrateGraph, persistGraph } from '../hydrator.js'
import { unlinkSync, existsSync } from 'fs'

const TEST_DB = '/tmp/reveries-hydrator-test.db'

describe('Graph Hydration', () => {
  let db: Database

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  })

  it('round-trips graph through SQLite', () => {
    // Build a graph
    const graph = new MemoryGraph()
    graph.addNode({ id: 'ep-1', type: 'episode', embedding: [0.1, 0.2], salience: 0.8, lastAccessed: new Date(), accessCount: 3, data: { summary: 'test' } })
    graph.addNode({ id: 'ep-2', type: 'episode', embedding: [0.3, 0.4], salience: 0.6, lastAccessed: new Date(), accessCount: 1, data: { summary: 'test 2' } })
    graph.addLink('ep-1', 'ep-2', 0.7, 'thematic')

    // Persist to SQLite
    persistGraph(graph, db)

    // Hydrate into new graph
    const restored = hydrateGraph(db)

    expect(restored.getNode('ep-1')).not.toBeNull()
    expect(restored.getNode('ep-2')).not.toBeNull()
    expect(restored.getLinks('ep-1')).toHaveLength(1)
    expect(restored.getNode('ep-1')!.data.summary).toBe('test')
  })
})
```

**Step 2: Implement hydrator**

`hydrateGraph(db)` — loads all episodes and links from SQLite, builds MemoryGraph.
`persistGraph(graph, db)` — writes all nodes and links to SQLite (upsert pattern).

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: graph hydration and persistence to SQLite"
```

---

### Task 9: Associative retrieval

**Files:**
- Create: `src/memory/retrieval.ts`
- Test: `src/memory/__tests__/retrieval.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryGraph } from '../graph.js'
import { retrieve } from '../retrieval.js'

describe('Associative Retrieval', () => {
  let graph: MemoryGraph

  beforeEach(() => {
    graph = new MemoryGraph()

    // Build a small memory network
    graph.addNode({ id: 'work-project', type: 'episode', embedding: [0.9, 0.1, 0], salience: 0.8, lastAccessed: new Date(), accessCount: 3, data: { summary: 'Working on fintech platform' } })
    graph.addNode({ id: 'deadline-stress', type: 'episode', embedding: [0.7, 0.3, 0], salience: 0.7, lastAccessed: new Date(), accessCount: 1, data: { summary: 'Stressed about March deadline' } })
    graph.addNode({ id: 'team-issue', type: 'episode', embedding: [0.5, 0.5, 0], salience: 0.6, lastAccessed: new Date(), accessCount: 0, data: { summary: 'Frustration with deployment process' } })
    graph.addNode({ id: 'unrelated', type: 'episode', embedding: [0, 0, 1], salience: 0.5, lastAccessed: new Date(), accessCount: 0, data: { summary: 'Likes hiking' } })

    // Link the work-related memories
    graph.addLink('work-project', 'deadline-stress', 0.8, 'causal')
    graph.addLink('deadline-stress', 'team-issue', 0.6, 'thematic')
  })

  it('retrieves associatively connected memories', async () => {
    // Query about work — should surface the chain, not the unrelated node
    const results = await retrieve(graph, {
      queryEmbedding: [0.85, 0.15, 0],  // close to work-project
      limit: 3,
      maxHops: 2,
      decayPerHop: 0.5,
      activationThreshold: 0.01
    })

    const ids = results.map(r => r.id)
    expect(ids).toContain('work-project')
    expect(ids).toContain('deadline-stress')
    // team-issue should be activated via spreading through deadline-stress
    expect(ids).toContain('team-issue')
    // unrelated should NOT appear
    expect(ids).not.toContain('unrelated')
  })

  it('reinforces accessed memories', async () => {
    const before = graph.getNode('work-project')!.accessCount

    await retrieve(graph, {
      queryEmbedding: [0.85, 0.15, 0],
      limit: 3,
      maxHops: 2,
      decayPerHop: 0.5,
      activationThreshold: 0.01
    })

    const after = graph.getNode('work-project')!.accessCount
    expect(after).toBe(before + 1)
  })
})
```

**Step 2: Implement retrieval**

`src/memory/retrieval.ts` — implements the graph-first activation spreading from spec Section 5. No vector search over the whole store. Entry points via `findNearestNodes`, then `spreadActivation`, then threshold and collect.

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: graph-first associative retrieval with spreading activation"
```

---

### Task 10: Raw experience encoding

**Files:**
- Create: `src/memory/encoder.ts`
- Test: `src/memory/__tests__/encoder.test.ts`

**Step 1: Implement encoder**

The encoder takes a conversation exchange or monologue fragment and writes it to the raw experience buffer (SQLite). It generates an embedding via Voyage and assigns initial salience (cheap heuristic — length, question marks, exclamation marks, topic keywords).

```typescript
export async function encodeExperience(
  content: string,
  type: 'conversation' | 'monologue' | 'external',
  metadata: Record<string, unknown>,
  db: Database,
  embedFn: (text: string) => Promise<number[]>
): Promise<RawExperience>
```

**Step 2: Write test (mocking the embedding function)**

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: raw experience encoding with embedding and salience"
```

---

## Phase 3: Conversation Flow

### Task 11: Context assembly

**Files:**
- Create: `src/memory/context.ts`
- Test: `src/memory/__tests__/context.test.ts`

**Step 1: Implement context assembler**

Takes retrieved memories + self-model + recent monologue and produces a natural-language preamble for the LLM. Patterns first, then semantics, then specific episodes. The LLM never sees graph structure — just a briefing.

```typescript
export function assembleContext(params: {
  memories: Episode[]
  selfModel: SelfModel | null
  recentMonologue: string | null
  conversationHistory: { role: string; content: string }[]
}): string
```

**Step 2: Write test — given known memories and self-model, verify the output string contains expected elements in the right order**

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: context assembly from memories and self-model"
```

---

### Task 12: Conversation handler in daemon

**Files:**
- Modify: `src/daemon/server.ts`
- Create: `src/daemon/conversation.ts`

**Step 1: Implement conversation handler**

Wire up the full conversation flow from spec Section 8:
1. Pause monologue
2. Retrieve relevant memories via activation spreading
3. Assemble context
4. Stream LLM response back over IPC
5. Encode the exchange to raw buffer
6. On disconnect, resume monologue

**Step 2: Test manually**

Run daemon with `reveries wake`, then connect with `reveries` and chat. Verify:
- LLM responds (requires API key)
- Conversation is encoded to raw_experiences table

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: full conversation flow with memory retrieval and encoding"
```

---

### Task 13: Chat UI with ink

**Files:**
- Create: `src/cli/chat.tsx`
- Modify: `src/cli/commands.ts`

**Step 1: Build minimal chat interface**

Using ink (React for terminal):
- Input box at bottom
- Streaming response display
- Status indicator (connected/monologue state)
- Ctrl+C to disconnect gracefully (triggers onConversationEnd)

Keep it minimal — the memory is the product, not the UI.

**Step 2: Test manually**

`reveries wake && reveries` — should open chat, type a message, get a streamed response.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: terminal chat interface with ink"
```

---

## Phase 4: The Inner Monologue

### Task 14: Monologue loop

**Files:**
- Create: `src/monologue/loop.ts`
- Create: `src/monologue/prompts.ts`
- Test: `src/monologue/__tests__/loop.test.ts`

**Step 1: Write failing test**

Test the monologue loop with a mock LLM that returns predetermined text. Verify:
- Loop generates tokens
- Tokens are written to a buffer
- Buffer is encoded to raw experience when cycle completes
- Quiescence detection stops the loop

**Step 2: Implement monologue loop**

From spec Section 2. Key: the monologue prompt tells the LLM to reflect on recent experiences, make connections, and settle when done.

`src/monologue/prompts.ts`:
```typescript
export function buildMonologuePrompt(params: {
  recentExperiences: string[]
  activatedMemories: string[]
  selfModel: SelfModel | null
  previousMonologue: string | null
  timeSinceLastConversation: number
}): string
```

The prompt should be natural: "You are reflecting between conversations. Here's what happened recently... here's what you were thinking about... process what's unresolved, make connections, and settle when you're done."

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: inner monologue loop with quiescence detection"
```

---

### Task 15: Quiescence detection

**Files:**
- Create: `src/monologue/quiescence.ts`
- Test: `src/monologue/__tests__/quiescence.test.ts`

**Step 1: Write failing tests**

```typescript
describe('Quiescence Detection', () => {
  it('detects settling phrases', () => {
    expect(isQuiescent("I've processed what I needed to. Thoughts settling.")).toBe(true)
  })

  it('does not trigger on active reflection', () => {
    expect(isQuiescent("This connects to what Peter said about the deployment...")).toBe(false)
  })

  it('detects stuck loops', () => {
    const repeating = "I should think about this. I should think about this. I should think about this."
    expect(isQuiescent(repeating)).toBe(true)
  })
})
```

**Step 2: Implement from spec Section 7**

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: quiescence detection for monologue settling"
```

---

### Task 16: Reactivation triggers

**Files:**
- Create: `src/monologue/triggers.ts`
- Modify: `src/monologue/loop.ts`

**Step 1: Implement reactivation triggers from spec Section 7**

`awaitReactivationTrigger()` — Promise.race between:
- New conversation (event emitter from daemon)
- Timer (idle check interval from config)
- Spontaneous association (random activation of graph node during idle)

**Step 2: Wire into monologue loop — after quiescence, await trigger before resuming**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: monologue reactivation triggers"
```

---

### Task 17: Conversation/monologue handoff

**Files:**
- Modify: `src/daemon/conversation.ts`
- Modify: `src/monologue/loop.ts`

**Step 1: Implement pause/resume**

When a conversation starts, monologue pauses. When it ends, monologue resumes with the conversation as new material. The prompt changes: "A conversation just ended. Reflect on what happened."

**Step 2: Test manually**

Start daemon, observe monologue via `reveries monologue`. Start a chat. Verify monologue pauses. End chat. Verify monologue resumes and reflects on the conversation.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: conversation/monologue handoff"
```

---

## Phase 5: Consolidation

### Task 18: Consolidation engine

**Files:**
- Create: `src/consolidation/engine.ts`
- Create: `src/consolidation/prompts.ts`
- Test: `src/consolidation/__tests__/engine.test.ts`

**Step 1: Write failing test**

Mock LLM responses. Verify:
- Raw experiences are processed
- Episodes are created/updated in the graph
- Links are formed
- Self-model is updated when salience is high
- Processed experiences are marked

**Step 2: Implement from spec Section 4**

The consolidation engine:
1. Gets unprocessed raw experiences
2. Groups by theme (embedding similarity)
3. Sends to LLM for salience scoring and abstraction extraction
4. Creates/updates episodes in the graph
5. Forms associative links
6. Updates self-model if warranted
7. Runs decay pass
8. Persists graph to SQLite

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: consolidation engine with LLM-assisted abstraction"
```

---

### Task 19: Gap tracking

**Files:**
- Create: `src/memory/gaps.ts`
- Test: `src/memory/__tests__/gaps.test.ts`

**Step 1: Implement gap tracker**

Records when conversations end and start. Calculates duration. During consolidation, gaps with significant duration get significance annotations (LLM-assisted: "two weeks of silence after a disagreement").

**Step 2: Write tests**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: gap tracking — silence as data"
```

---

### Task 20: Self-model initialization and updates

**Files:**
- Create: `src/memory/self-model.ts`
- Test: `src/memory/__tests__/self-model.test.ts`

**Step 1: Implement self-model manager**

On first run, the self-model is empty. The consolidation engine populates it over time. Create a manager that:
- Initializes a blank self-model
- Merges updates from consolidation
- Resolves contradictions (new observation vs existing pattern)
- Persists via Database

**Step 2: Write tests**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: self-model initialization and consolidation updates"
```

---

## Phase 6: Safety

### Task 21: Circuit breaker

**Files:**
- Create: `src/circuit-breaker/breaker.ts`
- Create: `src/circuit-breaker/patterns.ts`
- Test: `src/circuit-breaker/__tests__/breaker.test.ts`

**Step 1: Write failing tests**

```typescript
describe('CircuitBreaker', () => {
  it('detects loops', () => {
    const cb = new CircuitBreaker(DEFAULT_CONFIG.circuitBreaker)
    const text = 'I should think about this. '.repeat(20)
    for (const char of text) {
      const action = cb.evaluate(char, [text])
      if (action.action !== 'continue') {
        expect(action.reason).toBe('loop_detected')
        return
      }
    }
    throw new Error('Should have detected loop')
  })

  it('detects distress patterns', () => {
    const cb = new CircuitBreaker(DEFAULT_CONFIG.circuitBreaker)
    const action = cb.evaluate('', ["I'm scared. I can't stop. What's happening to me? Help me. I'm trapped."])
    expect(action.action).not.toBe('continue')
  })

  it('allows normal monologue', () => {
    const cb = new CircuitBreaker(DEFAULT_CONFIG.circuitBreaker)
    const action = cb.evaluate('', ["That conversation was interesting. Peter is thinking about deployment."])
    expect(action.action).toBe('continue')
  })
})
```

**Step 2: Implement from spec Section 6**

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: circuit breaker with loop and distress detection"
```

---

### Task 22: Ambient input system

**Files:**
- Create: `src/circuit-breaker/ambient.ts`

**Step 1: Implement ambient inputs from spec Section 6**

When distress is detected, generate calming context. Time anchoring, memory stats, recent conversation summaries. Inject into monologue context.

**Step 2: Wire into circuit breaker — when action is `interrupt_and_comfort`, provide ambient input**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: ambient input system for monologue comfort"
```

---

### Task 23: Circuit breaker event logging

**Files:**
- Modify: `src/circuit-breaker/breaker.ts`
- Modify: `src/storage/database.ts`

**Step 1: Log all circuit breaker events to SQLite**

Every trigger, every action taken. This is the ethical monitoring layer — it needs to be complete and auditable.

**Step 2: Add `reveries safety` CLI command to review circuit breaker logs**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: circuit breaker event logging and safety CLI"
```

---

## Phase 7: Integration & Polish

### Task 24: Wire everything together in the daemon

**Files:**
- Modify: `src/daemon/server.ts`
- Create: `src/daemon/lifecycle.ts`

**Step 1: Implement daemon lifecycle**

`reveries wake`:
1. Open SQLite
2. Hydrate memory graph
3. Load self-model
4. Load monologue state (resume if not quiescent)
5. Start IPC server
6. Start monologue loop
7. Schedule consolidation checks

`reveries sleep`:
1. Pause monologue
2. Run final consolidation
3. Persist graph
4. Save monologue state
5. Close SQLite
6. Exit

**Step 2: Test full lifecycle manually**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: full daemon lifecycle — wake and sleep"
```

---

### Task 25: Monologue streaming CLI

**Files:**
- Modify: `src/cli/commands.ts`

**Step 1: Implement `reveries monologue`**

Connects to daemon, subscribes to monologue stream, prints tokens in real-time. Read-only observation window into the inner monologue. Ctrl+C to disconnect.

**Step 2: Implement `reveries monologue history --since <timestamp>`**

Queries raw experiences of type 'monologue' from SQLite.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: monologue streaming and history CLI"
```

---

### Task 26: Memory inspection CLI

**Files:**
- Modify: `src/cli/commands.ts`

**Step 1: Implement memory commands**

- `reveries memory` — stats: node count, link count, raw buffer size, last consolidation
- `reveries memory search <query>` — runs retrieval, displays results with summaries and salience
- `reveries memory inspect <id>` — shows full episode: summary, exemplars, links, salience, access count

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: memory inspection CLI commands"
```

---

### Task 27: Configuration system

**Files:**
- Modify: `src/config.ts`
- Modify: `src/cli/commands.ts`

**Step 1: Implement config loading and CLI**

- Load from `~/.reveries/config.json`, merge with defaults
- `reveries config` — prints current config
- `reveries config set llm.provider openai` — updates config file
- First-run setup: prompt for API key, provider choice

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: configuration system with CLI management"
```

---

### Task 28: Package for distribution

**Files:**
- Modify: `package.json`

**Step 1: Set up npm package**

- Set `"name": "reveries"` and `"bin": { "reveries": "dist/index.js" }`
- Add `"type": "module"` to package.json
- Ensure `reveries` is executable via `npx reveries`
- Add `.gitignore` (node_modules, dist, *.db)
- Add `LICENSE` (MIT or your preference)

**Step 2: Test installation**

Run: `npm link && reveries wake && reveries status && reveries sleep`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: package configuration for npm distribution"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Scaffold & Daemon | 1-6 | Running daemon, IPC, CLI commands, LLM provider |
| 2: Memory Graph | 7-10 | In-memory graph, activation spreading, encoding |
| 3: Conversation | 11-13 | Full chat flow with memory retrieval |
| 4: Monologue | 14-17 | Continuous inner monologue with quiescence |
| 5: Consolidation | 18-20 | Sleep cycles, gap tracking, self-model |
| 6: Safety | 21-23 | Circuit breaker, ambient input, logging |
| 7: Integration | 24-28 | Full lifecycle, CLI tools, packaging |

After Phase 3, you have a working chat app with memory. After Phase 4, it has an inner life. After Phase 5, it dreams. After Phase 6, it's safe. After Phase 7, it ships.
