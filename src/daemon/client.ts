import net from 'node:net'
import { SOCKET_PATH } from './protocol.js'
import type { DaemonRequest, DaemonResponse, DaemonStatus } from './protocol.js'

export class DaemonClient {
  private socket: net.Socket | null = null
  private buffer: string = ''
  private handlers: Map<string, (response: DaemonResponse) => void> = new Map()
  private nextRequestId: number = 1

  private generateRequestId(): string {
    return String(this.nextRequestId++)
  }

  async connect(socketPath: string = SOCKET_PATH): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.connect(socketPath, () => {
        resolve()
      })

      this.socket.on('data', (data) => {
        this.buffer += data.toString()
        const lines = this.buffer.split('\n')
        this.buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.trim() === '') continue
          try {
            const response = JSON.parse(line) as DaemonResponse
            const id = response.requestId
            if (id && this.handlers.has(id)) {
              this.handlers.get(id)!(response)
            } else if (!id && this.handlers.size === 1) {
              // Backwards compat: no requestId in response, route to the sole handler
              const [, handler] = this.handlers.entries().next().value as [string, (r: DaemonResponse) => void]
              handler(response)
            }
          } catch {
            // Ignore malformed responses
          }
        }
      })

      this.socket.on('error', (err) => {
        reject(err)
      })
    })
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve()
        return
      }
      this.socket.on('close', () => {
        this.socket = null
        resolve()
      })
      this.socket.end()
    })
  }

  async send(request: DaemonRequest): Promise<DaemonResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new Error('Not connected'))
        return
      }

      const requestId = this.generateRequestId()

      this.handlers.set(requestId, (response: DaemonResponse) => {
        this.handlers.delete(requestId)
        resolve(response)
      })

      this.socket.write(JSON.stringify({ ...request, requestId }) + '\n')
    })
  }

  async status(): Promise<DaemonStatus> {
    const response = await this.send({ type: 'status' })
    if (response.type === 'status') {
      return response.data
    }
    throw new Error(`Unexpected response type: ${response.type}`)
  }

  async shutdown(): Promise<void> {
    const response = await this.send({ type: 'shutdown' })
    if (response.type !== 'ok') {
      throw new Error(`Unexpected response type: ${response.type}`)
    }
  }

  async chat(
    message: string,
    conversationId: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new Error('Not connected'))
        return
      }

      const requestId = this.generateRequestId()

      this.handlers.set(requestId, (response: DaemonResponse) => {
        if (response.type === 'chat-chunk') {
          onChunk(response.content)
          // Keep the handler active for more chunks
        } else if (response.type === 'chat-done') {
          this.handlers.delete(requestId)
          resolve()
        } else if (response.type === 'error') {
          this.handlers.delete(requestId)
          reject(new Error(response.message))
        } else {
          this.handlers.delete(requestId)
          reject(new Error(`Unexpected response type: ${response.type}`))
        }
      })

      this.socket.write(JSON.stringify({
        type: 'chat',
        message,
        conversationId,
        requestId
      } satisfies DaemonRequest) + '\n')
    })
  }

  async streamMonologue(onChunk: (chunk: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new Error('Not connected'))
        return
      }

      const requestId = this.generateRequestId()

      this.handlers.set(requestId, (response: DaemonResponse) => {
        if (response.type === 'monologue-chunk') {
          onChunk(response.content)
          // Keep the handler active for more chunks -- monologue streams indefinitely
        } else if (response.type === 'error') {
          this.handlers.delete(requestId)
          reject(new Error(response.message))
        }
        // Note: monologue stream does not have a 'done' message --
        // the client disconnects when the user presses Ctrl+C
      })

      this.socket.write(JSON.stringify({
        type: 'monologue-stream',
        requestId
      } satisfies DaemonRequest) + '\n')

      // Resolve when the socket closes (user disconnects)
      this.socket.on('close', () => {
        this.handlers.delete(requestId)
        resolve()
      })
    })
  }
}
