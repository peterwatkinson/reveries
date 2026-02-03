import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { DaemonClient } from '../daemon/client.js'
import { Database } from '../storage/database.js'
import { SelfModelManager } from '../memory/self-model.js'
import { loadConfig, saveConfig, validateConfig } from '../config.js'
import { startChat } from './chat.js'
import { getPidPath } from '../daemon/protocol.js'

const PID_FILE = getPidPath()

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

export async function wakeCommand(_options: { config?: string; foreground?: boolean }): Promise<void> {
  if (isDaemonRunning()) {
    console.log('Daemon is already running.')
    return
  }

  // Validate config before starting so errors are visible to the user
  const config = loadConfig()
  const errors = validateConfig(config)
  if (errors.length > 0) {
    console.error('Cannot start daemon — missing configuration:\n')
    for (const err of errors) {
      console.error(`  ${err.message}\n`)
    }
    process.exit(1)
  }

  if (_options.foreground) {
    console.log(`Daemon starting in foreground (PID: ${process.pid})\n`)
    // Import and run the daemon entry directly in this process
    await import('../daemon/entry.js')
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
    // Daemon unreachable — clean up stale PID file if present
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE)
    }
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

export async function memoryCommand(options: { search?: string; inspect?: string }): Promise<void> {
  if (options.search) {
    await memorySearchCommand(options.search)
    return
  }

  if (options.inspect) {
    await memoryInspectCommand(options.inspect)
    return
  }

  // Default: show stats
  await memoryStatsCommand()
}

async function memoryStatsCommand(): Promise<void> {
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

async function memorySearchCommand(query: string): Promise<void> {
  const client = new DaemonClient()
  try {
    await client.connect()
    const response = await client.send({ type: 'memory-search', query })
    await client.disconnect()
    if (response.type === 'ok') {
      const results = response.data as {
        id: string
        summary: string
        topics: string[]
        salience: number
        accessCount: number
        lastAccessed: string
      }[]

      if (results.length === 0) {
        console.log('No results found.')
        return
      }

      console.log(`\n  Found ${results.length} result(s):\n`)
      for (const result of results) {
        console.log(`  [${result.id}]`)
        console.log(`    Summary:      ${result.summary}`)
        console.log(`    Topics:       ${result.topics.join(', ')}`)
        console.log(`    Salience:     ${result.salience.toFixed(3)}`)
        console.log(`    Accessed:     ${result.accessCount} times`)
        console.log(`    Last access:  ${result.lastAccessed}`)
        console.log('')
      }
    } else if (response.type === 'error') {
      console.log(`Error: ${response.message}`)
    }
  } catch {
    console.log('Daemon is not running. Run \'reveries wake\' first.')
  }
}

async function memoryInspectCommand(id: string): Promise<void> {
  const config = loadConfig()
  const dbPath = config.storage.dbPath.replace('~', homedir())

  if (!existsSync(dbPath)) {
    console.log('No database found. Run \'reveries wake\' first to initialize.')
    return
  }

  const db = new Database(dbPath)
  try {
    const episode = db.getEpisode(id)
    if (!episode) {
      console.log(`Episode not found: ${id}`)
      return
    }

    console.log('')
    console.log(`  Episode: ${episode.id}`)
    console.log('  ' + '-'.repeat(40))
    console.log(`  Summary:     ${episode.summary}`)
    console.log(`  Topics:      ${episode.topics.join(', ')}`)
    console.log(`  Salience:    ${episode.salience.toFixed(3)}`)
    console.log(`  Confidence:  ${episode.confidence.toFixed(3)}`)
    console.log(`  Created:     ${episode.created.toISOString()}`)
    console.log(`  Accessed:    ${episode.accessCount} times`)
    console.log(`  Last access: ${episode.lastAccessed.toISOString()}`)

    if (episode.exemplars.length > 0) {
      console.log('\n  Exemplars:')
      for (const ex of episode.exemplars) {
        console.log(`    - "${ex.quote}" (${ex.context})`)
      }
    }

    if (episode.links.length > 0) {
      console.log('\n  Links:')
      for (const link of episode.links) {
        console.log(`    -> ${link.targetId} (${link.type}, strength: ${link.strength.toFixed(3)})`)
      }
    }

    if (episode.before.length > 0) {
      console.log(`\n  Before: ${episode.before.join(', ')}`)
    }
    if (episode.after.length > 0) {
      console.log(`  After:  ${episode.after.join(', ')}`)
    }

    console.log('')
  } finally {
    db.close()
  }
}

export async function monologueCommand(options: { history?: boolean; since?: string }): Promise<void> {
  if (options.history) {
    await monologueHistoryCommand(options.since)
    return
  }

  await monologueStreamCommand()
}

async function monologueStreamCommand(): Promise<void> {
  const client = new DaemonClient()
  try {
    await client.connect()
  } catch {
    console.log('Daemon is not running. Run \'reveries wake\' first.')
    return
  }

  console.log('Streaming inner monologue... (Ctrl+C to stop)\n')

  // Handle Ctrl+C gracefully
  const cleanup = async () => {
    process.stdout.write('\n')
    await client.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    cleanup().catch(() => process.exit(0))
  })

  try {
    await client.streamMonologue((chunk: string) => {
      process.stdout.write(chunk)
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    console.error(`\nError: ${errorMessage}`)
  }

  await client.disconnect()
}

async function monologueHistoryCommand(since?: string): Promise<void> {
  const config = loadConfig()
  const dbPath = config.storage.dbPath.replace('~', homedir())

  if (!existsSync(dbPath)) {
    console.log('No database found. Run \'reveries wake\' first to initialize.')
    return
  }

  const db = new Database(dbPath)
  try {
    const allRaw = db.getRawExperiences({})
    let monologueEntries = allRaw.filter(e => e.type === 'monologue')

    if (since) {
      const sinceDate = new Date(since)
      if (isNaN(sinceDate.getTime())) {
        console.log(`Invalid timestamp: ${since}`)
        return
      }
      monologueEntries = monologueEntries.filter(e => e.timestamp >= sinceDate)
    }

    if (monologueEntries.length === 0) {
      console.log('No monologue entries found.')
      return
    }

    // Sort by timestamp ascending
    monologueEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    for (const entry of monologueEntries) {
      console.log(`\n--- ${entry.timestamp.toISOString()} ---`)
      console.log(entry.content)
    }
    console.log('')
  } finally {
    db.close()
  }
}

export async function configCommand(action?: string, key?: string, value?: string): Promise<void> {
  if (!action) {
    // Print current config
    const config = loadConfig()
    console.log(JSON.stringify(config, null, 2))
    return
  }

  if (action === 'set' && key && value) {
    // Set a config value using dot notation
    const parts = key.split('.')
    const obj: Record<string, unknown> = {}
    let current: Record<string, unknown> = obj
    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {}
      current = current[parts[i]] as Record<string, unknown>
    }
    // Try to parse as JSON (for numbers, booleans)
    try {
      current[parts[parts.length - 1]] = JSON.parse(value)
    } catch {
      current[parts[parts.length - 1]] = value
    }
    saveConfig(obj as Partial<import('../config.js').ReveriesConfig>)
    console.log(`Set ${key} = ${value}`)
    return
  }

  console.log('Usage: reveries config [set <key> <value>]')
}

export async function nameCommand(newName?: string): Promise<void> {
  const config = loadConfig()
  const dbPath = config.storage.dbPath.replace('~', homedir())

  if (!existsSync(dbPath)) {
    console.log('No database found. Run \'reveries wake\' first to initialize.')
    return
  }

  const db = new Database(dbPath)
  try {
    const manager = new SelfModelManager(db)

    if (newName) {
      manager.setUserName(newName)
      console.log(`User name set to: ${newName}`)
      console.log('Restart the daemon for changes to take effect.')
    } else {
      const currentName = manager.getUserName()
      if (currentName) {
        console.log(`Current user name: ${currentName}`)
      } else {
        console.log('No user name set. Use \'reveries name <name>\' to set one.')
      }
    }
  } finally {
    db.close()
  }
}
