import net from 'node:net'
import { SOCKET_PATH } from './protocol.js'
import type { DaemonRequest, DaemonResponse, DaemonStatus } from './protocol.js'

export class DaemonClient {
  private socket: net.Socket | null = null
  private buffer: string = ''
  private responseHandler: ((response: DaemonResponse) => void) | null = null

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
            if (this.responseHandler) {
              this.responseHandler(response)
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

      this.responseHandler = (response: DaemonResponse) => {
        this.responseHandler = null
        resolve(response)
      }

      this.socket.write(JSON.stringify(request) + '\n')
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

      this.responseHandler = (response: DaemonResponse) => {
        if (response.type === 'chat-chunk') {
          onChunk(response.content)
          // Keep the handler active for more chunks
        } else if (response.type === 'chat-done') {
          this.responseHandler = null
          resolve()
        } else if (response.type === 'error') {
          this.responseHandler = null
          reject(new Error(response.message))
        } else {
          this.responseHandler = null
          reject(new Error(`Unexpected response type: ${response.type}`))
        }
      }

      this.socket.write(JSON.stringify({
        type: 'chat',
        message,
        conversationId
      } satisfies DaemonRequest) + '\n')
    })
  }
}
