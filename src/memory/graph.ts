export interface GraphNode {
  id: string
  type: string
  embedding: number[]
  salience: number
  created: Date
  lastAccessed: Date
  accessCount: number
  data: Record<string, unknown>
}

export interface GraphLink {
  targetId: string
  strength: number
  type: string
}

export interface SpreadActivationOptions {
  maxHops: number
  decayPerHop: number
}

export interface DecayOptions {
  halfLifeDays: number
  minimumSalience: number
  minimumLinkStrength?: number
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

function magnitude(v: number[]): number {
  let sum = 0
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i]
  }
  return Math.sqrt(sum)
}

function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a)
  const magB = magnitude(b)
  if (magA === 0 || magB === 0) return 0
  return dotProduct(a, b) / (magA * magB)
}

export class MemoryGraph {
  private nodes: Map<string, GraphNode> = new Map()
  private links: Map<string, GraphLink[]> = new Map()

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node)
  }

  getNode(id: string): GraphNode | null {
    return this.nodes.get(id) ?? null
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values())
  }

  addLink(fromId: string, toId: string, strength: number, type: string): void {
    const existing = this.links.get(fromId) ?? []
    existing.push({ targetId: toId, strength, type })
    this.links.set(fromId, existing)
  }

  getLinks(nodeId: string): GraphLink[] {
    return this.links.get(nodeId) ?? []
  }

  get nodeCount(): number {
    return this.nodes.size
  }

  get linkCount(): number {
    let count = 0
    for (const links of this.links.values()) {
      count += links.length
    }
    return count
  }

  findNearestNodes(queryEmbedding: number[], limit: number): GraphNode[] {
    const scored: { node: GraphNode; similarity: number }[] = []

    for (const node of this.nodes.values()) {
      const similarity = cosineSimilarity(queryEmbedding, node.embedding)
      scored.push({ node, similarity })
    }

    scored.sort((a, b) => b.similarity - a.similarity)

    return scored.slice(0, limit).map(s => s.node)
  }

  spreadActivation(
    seeds: Map<string, number>,
    options: SpreadActivationOptions
  ): Map<string, number> {
    const activations = new Map<string, number>(seeds)

    // Track which nodes have energy to propagate in the current hop
    let currentFrontier = new Map<string, number>(seeds)

    for (let hop = 0; hop < options.maxHops; hop++) {
      const nextFrontier = new Map<string, number>()

      for (const [nodeId, energy] of currentFrontier) {
        const outgoing = this.getLinks(nodeId)

        for (const link of outgoing) {
          const propagated = energy * link.strength * options.decayPerHop
          const existing = nextFrontier.get(link.targetId) ?? 0
          nextFrontier.set(link.targetId, existing + propagated)
        }
      }

      // Merge the propagated energy into the global activation map
      for (const [nodeId, energy] of nextFrontier) {
        const existing = activations.get(nodeId) ?? 0
        activations.set(nodeId, existing + energy)
      }

      currentFrontier = nextFrontier
    }

    return activations
  }

  reinforceNode(id: string): void {
    const node = this.nodes.get(id)
    if (!node) return
    node.accessCount += 1
    node.lastAccessed = new Date()
  }

  applyDecay(options: DecayOptions): void {
    const now = Date.now()
    const msPerDay = 24 * 60 * 60 * 1000

    // Decay node salience
    for (const node of this.nodes.values()) {
      const daysSinceAccess = (now - node.lastAccessed.getTime()) / msPerDay
      const decayFactor = Math.pow(0.5, daysSinceAccess / options.halfLifeDays)
      node.salience = Math.max(
        node.salience * decayFactor,
        options.minimumSalience
      )
    }

    // Decay link strengths based on source node's lastAccessed
    for (const [sourceId, links] of this.links) {
      const sourceNode = this.nodes.get(sourceId)
      if (!sourceNode) continue

      const daysSinceAccess = (now - sourceNode.lastAccessed.getTime()) / msPerDay
      const decayFactor = Math.pow(0.5, daysSinceAccess / options.halfLifeDays)

      for (const link of links) {
        link.strength = Math.max(
          link.strength * decayFactor,
          options.minimumLinkStrength ?? 0.05
        )
      }
    }
  }
}
