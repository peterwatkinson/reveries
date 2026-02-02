export type DaemonRequest =
  | { type: 'chat'; message: string; conversationId: string }
  | { type: 'status' }
  | { type: 'consolidate' }
  | { type: 'monologue-stream' }
  | { type: 'memory-stats' }
  | { type: 'memory-search'; query: string }
  | { type: 'shutdown' }

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
