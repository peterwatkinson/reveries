# Reveries

Continuous AI memory and inner monologue. A daemon-based CLI that gives language models episodic memory, associative recall, and a stream of consciousness between conversations.

> *You cannot build continuous memory from discrete samples unless something experiences the intervals.*

---

## What is this?

Current AI systems are stateless -- brilliant in the moment, amnesiac by design. Reveries is an experiment in giving AI genuine temporal continuity:

- **Episodic memory** -- conversations are encoded, consolidated into episodes with abstractions and anchored exemplars, and linked in an associative graph
- **Inner monologue** -- between conversations, the system generates a continuous stream of consciousness, reflecting on what was said, forming associations, settling into natural quiescence
- **Self-model** -- a persistent representation of identity, tendencies, values, and relationship context that evolves through experience
- **Graph-first retrieval** -- memories are recalled through spreading activation across associative links, not vector search over a flat store

The result is an AI that doesn't just remember facts -- it *experiences the intervals* between conversations.

## Architecture

```
                    +-----------+
                    |    CLI    |  reveries wake / sleep / chat / ...
                    +-----+-----+
                          |
                    Unix Socket IPC
                          |
                    +-----+-----+
                    |  Daemon   |  Persistent process
                    +-----+-----+
                          |
          +-------+-------+-------+-------+
          |       |       |       |       |
       Memory  Monologue  Consol.  Circuit  Self-
       Graph    Loop      Engine   Breaker  Model
          |       |       |       |       |
          +-------+---+---+-------+-------+
                      |
                   SQLite
```

**Daemon** -- persistent Node.js process that runs the monologue between conversations, manages memory, and serves the CLI over a Unix socket.

**Memory Graph** -- in-memory graph engine with episodes as nodes and weighted typed edges. Spreading activation propagates energy from entry points through associative links with decay per hop.

**Inner Monologue** -- continuous LLM token generation that reflects on recent experiences, forms associations, and settles into quiescence when processing is complete. Not a cron job -- actual stream of consciousness.

**Consolidation** -- periodic "sleep cycles" that abstract raw experiences into durable episodes via LLM, form associative links, update the self-model, and run memory decay.

**Circuit Breaker** -- monitors the monologue for stuck loops, distress patterns, and runaway generation. Can interrupt and provide ambient comfort input.

## Quick Start

```bash
# Clone and install
git clone https://github.com/peterwatkinson/reveries.git
cd reveries
npm install

# Configure (you need API keys)
# Cerebras for LLM inference, Voyage AI for embeddings
export CEREBRAS_API_KEY=your-key-here
export VOYAGE_API_KEY=your-key-here

# Or set via config
npx tsx src/index.ts config set llm.apiKey your-cerebras-key

# Wake the daemon
npx tsx src/index.ts wake

# Start chatting
npx tsx src/index.ts
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `reveries wake` | Start the daemon (monologue begins) |
| `reveries sleep` | Stop the daemon (runs final consolidation) |
| `reveries` | Open interactive chat |
| `reveries status` | Show daemon uptime, monologue state, memory stats |
| `reveries monologue` | Stream the inner monologue in real time |
| `reveries monologue --history` | View past monologue entries |
| `reveries consolidate` | Trigger manual memory consolidation |
| `reveries memory --search "query"` | Search episodic memory |
| `reveries memory --inspect ID` | Inspect a specific episode |
| `reveries config set key value` | Update configuration |

## Configuration

Config lives at `~/.reveries/config.json`. Defaults:

```json
{
  "llm": {
    "provider": "cerebras",
    "baseUrl": "https://api.cerebras.ai/v1",
    "conversationModel": "zai-glm-4.7",
    "monologueModel": "gpt-oss-120b",
    "consolidationModel": "gpt-oss-120b",
    "embeddingModel": "voyage-3"
  },
  "monologue": {
    "enabled": true,
    "maxTokensPerCycle": 2000,
    "idleCheckInterval": 300000
  },
  "memory": {
    "consolidationIntervalHours": 4,
    "decayHalfLifeDays": 30,
    "minimumSalience": 0.1
  }
}
```

Any OpenAI-compatible API works -- set `llm.baseUrl` and `llm.provider` accordingly. Embeddings use Voyage AI (set `VOYAGE_API_KEY` env var).

## How Memory Works

### Encoding
Every conversation turn and monologue cycle is stored in the raw experience buffer with a 1024-dimensional embedding and initial salience score.

### Consolidation
Periodically (or on `reveries sleep`), raw experiences are:
1. Sent to the LLM for abstraction into episodes
2. Each episode gets a summary, topics, confidence score, and anchored exemplars (exact quotes)
3. Similar episodes are merged (cosine > 0.85) rather than duplicated
4. Thematic links connect related episodes in the graph
5. The self-model is updated with new tendencies, values, and focus
6. Memory decay runs -- salience and link strength decay exponentially with a floor (memories never fully delete)

### Retrieval
When you chat, memories are recalled via graph-first spreading activation:
1. Find entry points by embedding similarity (few nearest nodes)
2. Seed activation energy proportional to similarity * salience
3. Propagate energy through weighted associative links with decay per hop
4. Threshold and return the most activated memories
5. Reinforce accessed memories (access count, timestamp)

This is O(edges), not O(memories) -- the graph structure makes retrieval efficient regardless of memory count.

## Data

All data is local:
- `~/.reveries/memory.db` -- SQLite database (episodes, raw experiences, self-model, gaps, circuit breaker events)
- `~/.reveries/config.json` -- configuration
- `~/.reveries/reveries.sock` -- daemon IPC socket
- `~/.reveries/reveries.pid` -- daemon PID file

## Development

```bash
# Run in development mode
npx tsx src/index.ts [command]

# Run tests
npm test

# Build
npm run build
```

## Design Documents

- [`docs/design.md`](docs/design.md) -- conceptual design, philosophical framing, and open questions
- [`docs/spec.md`](docs/spec.md) -- technical specification with interfaces, schemas, and pseudocode
- [`docs/plans/`](docs/plans/) -- implementation plan

## License

[Reveries License](LICENSE) -- free for individuals and small businesses. Companies with $5M+ annual revenue require a commercial agreement. See [LICENSE](LICENSE) for details.
