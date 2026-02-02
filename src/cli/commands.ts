import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { DaemonClient } from '../daemon/client.js'
import { startChat } from './chat.js'

const PID_FILE = '/tmp/reveries.pid'

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function isDaemonRunning(): boolean {
  if (!existsSync(PID_FILE)) {
    return false
  }
  const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
  try {
    // Sending signal 0 checks if the process exists without actually signaling it
    process.kill(pid, 0)
    return true
  } catch {
    // Process doesn't exist, clean up stale PID file
    unlinkSync(PID_FILE)
    return false
  }
}

export async function wakeCommand(_options: { config?: string }): Promise<void> {
  if (isDaemonRunning()) {
    console.log('Daemon is already running.')
    return
  }

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const daemonEntry = path.resolve(__dirname, '../daemon/entry.ts')

  const child = fork(daemonEntry, [], {
    detached: true,
    stdio: 'ignore',
    execArgv: ['--import', 'tsx']
  })

  child.unref()

  console.log(`Daemon waking up (PID: ${child.pid})`)
}

export async function sleepCommand(): Promise<void> {
  const client = new DaemonClient()
  try {
    await client.connect()
    await client.shutdown()
    await client.disconnect()
    console.log('Daemon is going to sleep...')
  } catch {
    console.log('Daemon is not running.')
  }
}

export async function statusCommand(): Promise<void> {
  const client = new DaemonClient()
  try {
    await client.connect()
    const status = await client.status()
    await client.disconnect()

    console.log('')
    console.log('  Reveries Daemon Status')
    console.log('  ----------------------')
    console.log(`  Uptime:              ${formatUptime(status.uptime)}`)
    console.log(`  Monologue state:     ${status.monologueState}`)
    console.log(`  Last consolidation:  ${status.lastConsolidation ?? 'never'}`)
    console.log(`  Raw buffer count:    ${status.memoryStats.rawBufferCount}`)
    console.log(`  Episode count:       ${status.memoryStats.episodeCount}`)
    console.log(`  Link count:          ${status.memoryStats.linkCount}`)
    console.log('')
  } catch {
    console.log('Daemon is not running. Run \'reveries wake\' first.')
  }
}

export async function defaultCommand(): Promise<void> {
  await startChat()
}

export async function consolidateCommand(): Promise<void> {
  const client = new DaemonClient()
  try {
    await client.connect()
    const response = await client.send({ type: 'consolidate' })
    await client.disconnect()
    if (response.type === 'ok') {
      console.log('Consolidation triggered.')
    } else if (response.type === 'error') {
      console.log(`Error: ${response.message}`)
    }
  } catch {
    console.log('Daemon is not running. Run \'reveries wake\' first.')
  }
}

export async function memoryCommand(): Promise<void> {
  const client = new DaemonClient()
  try {
    await client.connect()
    const response = await client.send({ type: 'memory-stats' })
    await client.disconnect()
    if (response.type === 'ok') {
      const stats = response.data as {
        rawBufferCount: number
        episodeCount: number
        linkCount: number
      }
      console.log('')
      console.log('  Memory Stats')
      console.log('  ------------')
      console.log(`  Raw buffer count:  ${stats.rawBufferCount}`)
      console.log(`  Episode count:     ${stats.episodeCount}`)
      console.log(`  Link count:        ${stats.linkCount}`)
      console.log('')
    } else if (response.type === 'error') {
      console.log(`Error: ${response.message}`)
    }
  } catch {
    console.log('Daemon is not running. Run \'reveries wake\' first.')
  }
}

export function monologueCommand(): void {
  console.log('Monologue streaming not yet implemented.')
}
