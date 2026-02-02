export type DaemonRequest =
  | { type: 'chat'; message: string; conversationId: string; requestId?: string }
  | { type: 'status'; requestId?: string }
  | { type: 'consolidate'; requestId?: string }
  | { type: 'monologue-stream'; requestId?: string }
  | { type: 'memory-stats'; requestId?: string }
  | { type: 'memory-search'; query: string; requestId?: string }
  | { type: 'shutdown'; requestId?: string }

export type DaemonResponse =
  | { type: 'chat-chunk'; content: string; requestId?: string }
  | { type: 'chat-done'; requestId?: string }
  | { type: 'status'; data: DaemonStatus; requestId?: string }
  | { type: 'monologue-chunk'; content: string; requestId?: string }
  | { type: 'error'; message: string; requestId?: string }
  | { type: 'ok'; data?: unknown; requestId?: string }

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
