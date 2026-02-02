import { Database } from '../storage/database.js'
import { MemoryGraph } from './graph.js'
import type { Episode } from './types.js'

export function hydrateGraph(db: Database): MemoryGraph {
  const graph = new MemoryGraph()

  const episodes = db.getAllEpisodes()

  for (const ep of episodes) {
    graph.addNode({
      id: ep.id,
      type: 'episode',
      embedding: ep.embedding,
      salience: ep.salience,
      lastAccessed: ep.lastAccessed,
      accessCount: ep.accessCount,
      data: {
        summary: ep.summary,
        topics: ep.topics,
        confidence: ep.confidence,
        exemplars: ep.exemplars,
        before: ep.before,
        after: ep.after,
        gap: ep.gap
      }
    })

    for (const link of ep.links) {
      graph.addLink(ep.id, link.targetId, link.strength, link.type)
    }
  }

  return graph
}

export function persistGraph(graph: MemoryGraph, db: Database): void {
  const nodes = graph.getAllNodes()

  // First pass: upsert all episode nodes
  for (const node of nodes) {
    const episode: Episode = {
      id: node.id,
      created: node.lastAccessed,
      lastAccessed: node.lastAccessed,
      accessCount: node.accessCount,
      summary: (node.data.summary as string) ?? '',
      embedding: node.embedding,
      exemplars: (node.data.exemplars as Episode['exemplars']) ?? [],
      before: (node.data.before as string[]) ?? [],
      after: (node.data.after as string[]) ?? [],
      gap: (node.data.gap as Episode['gap']) ?? { duration: 0, significance: null },
      links: [],
      salience: node.salience,
      confidence: (node.data.confidence as number) ?? 0,
      topics: (node.data.topics as string[]) ?? []
    }

    db.upsertEpisode(episode)
  }

  // Second pass: persist all links (after all nodes exist for FK constraints)
  for (const node of nodes) {
    db.deleteEpisodeLinks(node.id)
    const links = graph.getLinks(node.id)
    for (const link of links) {
      db.insertEpisodeLink(node.id, link.targetId, link.strength, link.type)
    }
  }
}
