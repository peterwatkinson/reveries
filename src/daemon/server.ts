import net from 'node:net'
import { unlinkSync, existsSync } from 'node:fs'
import { SOCKET_PATH } from './protocol.js'
import type { DaemonRequest, DaemonResponse, DaemonStatus } from './protocol.js'
import { ConversationHandler } from './conversation.js'
import type { MemoryGraph } from '../memory/graph.js'
import type { Database } from '../storage/database.js'
import type { SelfModel } from '../memory/types.js'
import type { ReveriesConfig } from '../config.js'
import type { MonologueManager } from '../monologue/manager.js'

export class DaemonServer {
  private server: net.Server | null = null
  private connections: Set<net.Socket> = new Set()
  private startTime: number = 0
  private conversationHandler: ConversationHandler | null = null
  private graph: MemoryGraph | null = null
  private db: Database | null = null
  private monologue: MonologueManager | null = null

  init(params: {
    graph: MemoryGraph
    db: Database
    selfModel: SelfModel | null
    config: ReveriesConfig
  }): void {
    this.graph = params.graph
    this.db = params.db
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

  async start(socketPath: string = SOCKET_PATH): Promise<void> {
    if (existsSync(socketPath)) {
      unlinkSync(socketPath)
    }

    this.startTime = Date.now()

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.connections.add(socket)
        let buffer = ''

        socket.on('data', (data) => {
          buffer += data.toString()
          const lines = buffer.split('\n')
          // Keep the last (possibly incomplete) chunk in the buffer
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.trim() === '') continue
            try {
              const request = JSON.parse(line) as DaemonRequest
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
    switch (request.type) {
      case 'status':
        this.handleStatus(socket)
        break
      case 'shutdown':
        this.handleShutdown(socket)
        break
      case 'consolidate':
        this.sendResponse(socket, { type: 'ok' })
        break
      case 'memory-stats':
        this.sendResponse(socket, { type: 'ok', data: this.getMemoryStats() })
        break
      case 'memory-search':
        this.sendResponse(socket, { type: 'ok', data: [] })
        break
      case 'chat':
        this.handleChat(request.message, request.conversationId, socket)
        break
      case 'monologue-stream':
        this.handleMonologueStream(socket)
        break
      default:
        this.sendResponse(socket, {
          type: 'error',
          message: `Unknown request type`
        })
    }
  }

  private async handleChat(message: string, conversationId: string, socket: net.Socket): Promise<void> {
    if (!this.conversationHandler) {
      this.sendResponse(socket, { type: 'error', message: 'Daemon not initialized. Memory subsystem unavailable.' })
      return
    }

    // Pause monologue during conversation
    if (this.monologue) {
      this.monologue.pause()
    }

    try {
      await this.conversationHandler.handleMessage(
        message,
        conversationId,
        (chunk: string) => {
          this.sendResponse(socket, { type: 'chat-chunk', content: chunk })
        }
      )
      this.sendResponse(socket, { type: 'chat-done' })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error during chat'
      this.sendResponse(socket, { type: 'error', message: errorMessage })
    } finally {
      // Resume monologue after conversation turn
      if (this.monologue) {
        this.monologue.resumeAfterConversation()
      }
    }
  }

  private handleStatus(socket: net.Socket): void {
    const status: DaemonStatus = {
      uptime: Date.now() - this.startTime,
      monologueState: this.monologue?.state ?? 'quiescent',
      memoryStats: this.getMemoryStats(),
      lastConsolidation: null
    }
    this.sendResponse(socket, { type: 'status', data: status })
  }

  private handleMonologueStream(socket: net.Socket): void {
    if (!this.monologue) {
      this.sendResponse(socket, { type: 'error', message: 'Monologue not available' })
      return
    }

    const listener = (token: string) => {
      this.sendResponse(socket, { type: 'monologue-chunk', content: token })
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
      this.sendResponse(socket, { type: 'monologue-chunk', content: currentBuffer })
    }
  }

  private handleShutdown(socket: net.Socket): void {
    this.sendResponse(socket, { type: 'ok' })
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
    return {
      rawBufferCount: 0,
      episodeCount: this.graph?.nodeCount ?? 0,
      linkCount: this.graph?.linkCount ?? 0
    }
  }

  private sendResponse(socket: net.Socket, response: DaemonResponse): void {
    if (!socket.destroyed) {
      socket.write(JSON.stringify(response) + '\n')
    }
  }
}
