import net from 'node:net'
import { unlinkSync, existsSync } from 'node:fs'
import { SOCKET_PATH } from './protocol.js'
import type { DaemonRequest, DaemonResponse, DaemonStatus } from './protocol.js'

export class DaemonServer {
  private server: net.Server | null = null
  private connections: Set<net.Socket> = new Set()
  private startTime: number = 0

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
        // Placeholder: echo back and done
        this.sendResponse(socket, { type: 'chat-chunk', content: '' })
        this.sendResponse(socket, { type: 'chat-done' })
        break
      case 'monologue-stream':
        this.sendResponse(socket, { type: 'ok' })
        break
      default:
        this.sendResponse(socket, {
          type: 'error',
          message: `Unknown request type`
        })
    }
  }

  private handleStatus(socket: net.Socket): void {
    const status: DaemonStatus = {
      uptime: Date.now() - this.startTime,
      monologueState: 'quiescent',
      memoryStats: this.getMemoryStats(),
      lastConsolidation: null
    }
    this.sendResponse(socket, { type: 'status', data: status })
  }

  private handleShutdown(socket: net.Socket): void {
    this.sendResponse(socket, { type: 'ok' })
    // Defer stop so the response can be sent
    setImmediate(() => {
      this.stop().catch(() => {
        // Ignore errors during shutdown
      })
    })
  }

  private getMemoryStats() {
    return {
      rawBufferCount: 0,
      episodeCount: 0,
      linkCount: 0
    }
  }

  private sendResponse(socket: net.Socket, response: DaemonResponse): void {
    if (!socket.destroyed) {
      socket.write(JSON.stringify(response) + '\n')
    }
  }
}
