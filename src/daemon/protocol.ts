import { homedir } from 'node:os'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const REVERIES_DIR = path.join(homedir(), '.reveries')

function ensureReveriesDir(): void {
  mkdirSync(REVERIES_DIR, { recursive: true })
}

export function getSocketPath(): string {
  ensureReveriesDir()
  return path.join(REVERIES_DIR, 'reveries.sock')
}

export function getPidPath(): string {
  ensureReveriesDir()
  return path.join(REVERIES_DIR, 'reveries.pid')
}

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
  | { type: 'proactive-message'; content: string; requestId?: string }
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

export const SOCKET_PATH = getSocketPath()
