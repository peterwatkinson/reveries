import net from 'node:net'
import { unlinkSync, existsSync } from 'node:fs'
import { SOCKET_PATH } from './protocol.js'
import type { DaemonRequest, DaemonResponse, DaemonStatus } from './protocol.js'
import { ConversationHandler } from './conversation.js'
import { retrieve } from '../memory/retrieval.js'
import { generateEmbedding } from '../providers/embeddings.js'
import type { MemoryGraph } from '../memory/graph.js'
import type { Database } from '../storage/database.js'
import type { SelfModel } from '../memory/types.js'
import type { ReveriesConfig } from '../config.js'
import type { MonologueManager } from '../monologue/manager.js'
import type { ConsolidationEngine } from '../consolidation/engine.js'

export class DaemonServer {
  private server: net.Server | null = null
  private connections: Set<net.Socket> = new Set()
  private startTime: number = 0
  private conversationHandler: ConversationHandler | null = null
  private graph: MemoryGraph | null = null
  private db: Database | null = null
  private config: ReveriesConfig | null = null
  private monologue: MonologueManager | null = null
  private consolidation: ConsolidationEngine | null = null
  private conversationTimer: ReturnType<typeof setTimeout> | null = null
  private monologuePausedForConversation: boolean = false

  init(params: {
    graph: MemoryGraph
    db: Database
    selfModel: SelfModel | null
    config: ReveriesConfig
  }): void {
    this.graph = params.graph
    this.db = params.db
    this.config = params.config
    this.conversationHandler = new ConversationHandler({
      graph: params.graph,
      db: params.db,
      selfModel: params.selfModel,
      config: params.config
    })
  }

  setMonologue(monologue: MonologueManager): void {
    this.monologue = monologue
    // Pass monologue reference to conversation handler for pause/resume
    if (this.conversationHandler) {
      this.conversationHandler.setMonologue(monologue)
    }
  }

  setConsolidation(engine: ConsolidationEngine): void {
    this.consolidation = engine
  }

  async start(socketPath: string = SOCKET_PATH): Promise<void> {
    if (existsSync(socketPath)) {
      unlinkSync(socketPath)
    }

    this.startTime = Date.now()

    return new Promise((resolve, reject) => {
      const MAX_BUFFER_SIZE = 1024 * 1024 // 1MB

      this.server = net.createServer((socket) => {
        this.connections.add(socket)
        let buffer = ''

        socket.on('data', (data) => {
          buffer += data.toString()

          if (buffer.length > MAX_BUFFER_SIZE) {
            this.sendResponse(socket, { type: 'error', message: 'Message too large' })
            buffer = ''
            return
          }

          const lines = buffer.split('\n')
          // Keep the last (possibly incomplete) chunk in the buffer
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.trim() === '') continue
            try {
              const parsed = JSON.parse(line)
              if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
                this.sendResponse(socket, { type: 'error', message: 'Invalid request: missing type' })
                continue
              }
              const request = parsed as DaemonRequest
              this.handleRequest(request, socket)
            } catch {
              this.sendResponse(socket, {
                type: 'error',
                message: 'Invalid JSON'
              })
            }
          }
        })

        socket.on('close', () => {
          this.connections.delete(socket)
        })

        socket.on('error', () => {
          this.connections.delete(socket)
        })
      })

      this.server.on('error', reject)

      this.server.listen(socketPath, () => {
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    // Close all active connections
    for (const socket of this.connections) {
      socket.destroy()
    }
    this.connections.clear()

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close((err) => {
        if (err) {
          reject(err)
        } else {
          this.server = null
          resolve()
        }
      })
    })
  }

  private handleRequest(request: DaemonRequest, socket: net.Socket): void {
    const requestId = request.requestId

    switch (request.type) {
      case 'status':
        this.handleStatus(socket, requestId)
        break
      case 'shutdown':
        this.handleShutdown(socket, requestId)
        break
      case 'consolidate':
        this.handleConsolidate(socket, requestId)
        break
      case 'memory-stats':
        this.sendResponse(socket, { type: 'ok', data: this.getMemoryStats() }, requestId)
        break
      case 'memory-search':
        this.handleMemorySearch(request.query, socket, requestId)
        break
      case 'chat':
        this.handleChat(request.message, request.conversationId, socket, requestId)
        break
      case 'monologue-stream':
        this.handleMonologueStream(socket, requestId)
        break
      default:
        this.sendResponse(socket, {
          type: 'error',
          message: `Unknown request type`
        }, requestId)
    }
  }

  private async handleChat(message: string, conversationId: string, socket: net.Socket, requestId?: string): Promise<void> {
    if (!this.conversationHandler) {
      this.sendResponse(socket, { type: 'error', message: 'Daemon not initialized. Memory subsystem unavailable.' }, requestId)
      return
    }

    // Pause monologue on the first message of a conversation session
    if (this.monologue && !this.monologuePausedForConversation) {
      this.monologue.pause()
      this.monologuePausedForConversation = true
    }

    // Reset the conversation timeout timer
    this.resetConversationTimer()

    try {
      await this.conversationHandler.handleMessage(
        message,
        conversationId,
        (chunk: string) => {
          this.sendResponse(socket, { type: 'chat-chunk', content: chunk }, requestId)
        }
      )
      this.sendResponse(socket, { type: 'chat-done' }, requestId)
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error during chat'
      this.sendResponse(socket, { type: 'error', message: errorMessage }, requestId)
    }
  }

  private resetConversationTimer(): void {
    if (this.conversationTimer) {
      clearTimeout(this.conversationTimer)
    }
    this.conversationTimer = setTimeout(() => {
      // No message for 30s — consider conversation ended
      if (this.monologue && this.monologuePausedForConversation) {
        this.monologue.resumeAfterConversation()
        this.monologuePausedForConversation = false
      }
      this.conversationTimer = null
    }, 30_000)
  }

  private async handleConsolidate(socket: net.Socket, requestId?: string): Promise<void> {
    if (!this.consolidation) {
      this.sendResponse(socket, { type: 'error', message: 'Consolidation engine not available' }, requestId)
      return
    }

    try {
      await this.consolidation.consolidate()
      this.sendResponse(socket, { type: 'ok', data: this.getMemoryStats() }, requestId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Consolidation failed'
      this.sendResponse(socket, { type: 'error', message: msg }, requestId)
    }
  }

  private handleStatus(socket: net.Socket, requestId?: string): void {
    const status: DaemonStatus = {
      uptime: Date.now() - this.startTime,
      monologueState: this.monologue?.state ?? 'quiescent',
      memoryStats: this.getMemoryStats(),
      lastConsolidation: null
    }
    this.sendResponse(socket, { type: 'status', data: status }, requestId)
  }

  private handleMonologueStream(socket: net.Socket, requestId?: string): void {
    if (!this.monologue) {
      this.sendResponse(socket, { type: 'error', message: 'Monologue not available' }, requestId)
      return
    }

    const listener = (token: string) => {
      this.sendResponse(socket, { type: 'monologue-chunk', content: token }, requestId)
    }

    this.monologue.onToken(listener)

    // Clean up when client disconnects
    socket.on('close', () => {
      this.monologue?.removeTokenListener(listener)
    })

    socket.on('error', () => {
      this.monologue?.removeTokenListener(listener)
    })

    // Send current buffer as initial content if available
    const currentBuffer = this.monologue.recentBuffer
    if (currentBuffer) {
      this.sendResponse(socket, { type: 'monologue-chunk', content: currentBuffer }, requestId)
    }
  }

  private async handleMemorySearch(query: string, socket: net.Socket, requestId?: string): Promise<void> {
    if (!this.graph || !this.config) {
      this.sendResponse(socket, { type: 'error', message: 'Daemon not initialized' }, requestId)
      return
    }

    try {
      const queryEmbedding = await generateEmbedding(query, this.config.llm.embeddingModel)
      const results = retrieve(this.graph, {
        queryEmbedding,
        limit: 10,
        maxHops: 2,
        decayPerHop: 0.5,
        activationThreshold: 0.01
      })

      const formatted = results.map(node => ({
        id: node.id,
        summary: node.data.summary as string,
        topics: node.data.topics as string[],
        salience: node.salience,
        accessCount: node.accessCount,
        lastAccessed: node.lastAccessed.toISOString()
      }))

      this.sendResponse(socket, { type: 'ok', data: formatted }, requestId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Memory search failed'
      this.sendResponse(socket, { type: 'error', message: msg }, requestId)
    }
  }

  private handleShutdown(socket: net.Socket, requestId?: string): void {
    this.sendResponse(socket, { type: 'ok' }, requestId)
    // Defer stop so the response can be sent
    setImmediate(async () => {
      try {
        if (this.monologue) {
          await this.monologue.stop()
        }
        await this.stop()
      } catch {
        // Ignore errors during shutdown
      }
    })
  }

  private getMemoryStats() {
    let rawBufferCount = 0
    if (this.db) {
      try {
        rawBufferCount = this.db.getRawExperiences({ processed: false }).length
      } catch {
        // Ignore errors reading raw buffer
      }
    }
    return {
      rawBufferCount,
      episodeCount: this.graph?.nodeCount ?? 0,
      linkCount: this.graph?.linkCount ?? 0
    }
  }

  private sendResponse(socket: net.Socket, response: DaemonResponse, requestId?: string): void {
    if (!socket.destroyed) {
      const payload = requestId ? { ...response, requestId } : response
      socket.write(JSON.stringify(payload) + '\n')
    }
  }
}
