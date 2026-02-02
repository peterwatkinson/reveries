import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DaemonServer } from '../server.js'
import { DaemonClient } from '../client.js'
import { SOCKET_PATH } from '../protocol.js'
import { unlinkSync, existsSync } from 'fs'

describe('Daemon IPC', () => {
  let server: DaemonServer
  let client: DaemonClient

  beforeAll(async () => {
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
    server = new DaemonServer()
    await server.start()
    client = new DaemonClient()
    await client.connect()
  })

  afterAll(async () => {
    await client.disconnect()
    await server.stop()
  })

  it('responds to status request', async () => {
    const status = await client.status()
    expect(status).toHaveProperty('uptime')
    expect(status).toHaveProperty('monologueState')
    expect(status).toHaveProperty('memoryStats')
  })
})
