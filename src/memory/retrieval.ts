import { MemoryGraph, GraphNode } from './graph.js'

export interface RetrievalOptions {
  queryEmbedding: number[]
  limit: number
  maxHops: number
  decayPerHop: number
  activationThreshold: number
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

export function retrieve(graph: MemoryGraph, options: RetrievalOptions): GraphNode[] {
  if (graph.nodeCount === 0) return []

  // 1. Find entry points — few nearest nodes by embedding
  const entryCount = Math.min(5, graph.nodeCount)
  const entryNodes = graph.findNearestNodes(options.queryEmbedding, entryCount)

  // 2. Seed activation
  const seeds = new Map<string, number>()
  for (const node of entryNodes) {
    // Initial energy based on similarity and salience
    const similarity = cosineSimilarity(options.queryEmbedding, node.embedding)
    seeds.set(node.id, similarity * node.salience)
  }

  // 3. Spread activation through the graph
  const activations = graph.spreadActivation(seeds, {
    maxHops: options.maxHops,
    decayPerHop: options.decayPerHop
  })

  // 4. Threshold and collect
  const surfaced = [...activations.entries()]
    .filter(([_, energy]) => energy > options.activationThreshold)
    .sort(([_a, a], [_b, b]) => b - a)
    .slice(0, options.limit)

  // 5. Reinforce accessed memories
  for (const [nodeId] of surfaced) {
    graph.reinforceNode(nodeId)
  }

  // 6. Return the nodes
  return surfaced.map(([nodeId]) => graph.getNode(nodeId)!).filter(Boolean)
}
