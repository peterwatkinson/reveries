import * as readline from 'node:readline'
import { DaemonClient } from '../daemon/client.js'
import { nanoid } from 'nanoid'

const HELP_TEXT = `
Commands:
  /status        Show daemon status
  /memory <q>    Search memories for <q>
  /consolidate   Trigger memory consolidation
  /monologue     Toggle live monologue stream
  /help          Show this help
`

export async function startChat(): Promise<void> {
  const client = new DaemonClient()

  try {
    await client.connect()
  } catch {
    console.log('Could not connect to daemon. Run "reveries wake" first.')
    process.exit(1)
  }

  const conversationId = nanoid()
  let monologueStreamActive = false

  console.log('Connected to Dolores. Type your message and press Enter. Ctrl+C to exit.')
  console.log('Type /help for commands.\n')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  })

  rl.prompt()

  rl.on('line', async (line: string) => {
    const message = line.trim()
    if (!message) {
      rl.prompt()
      return
    }

    // Handle slash commands
    if (message.startsWith('/')) {
      await handleCommand(message, client, {
        getMonologueActive: () => monologueStreamActive,
        setMonologueActive: (val: boolean) => { monologueStreamActive = val },
        prompt: () => rl.prompt()
      })
      return
    }

    // Send to daemon and stream response
    process.stdout.write('\n')

    try {
      await client.chat(message, conversationId, (chunk: string) => {
        process.stdout.write(chunk)
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      console.error(`\nError: ${errorMessage}`)
    }

    process.stdout.write('\n\n')
    rl.prompt()
  })

  rl.on('close', async () => {
    console.log('\nGoodbye.')
    await client.disconnect()
    process.exit(0)
  })
}

async function handleCommand(
  input: string,
  client: DaemonClient,
  ctx: {
    getMonologueActive: () => boolean
    setMonologueActive: (val: boolean) => void
    prompt: () => void
  }
): Promise<void> {
  const parts = input.slice(1).split(/\s+/)
  const cmd = parts[0]?.toLowerCase()
  const args = parts.slice(1).join(' ')

  switch (cmd) {
    case 'help':
      console.log(HELP_TEXT)
      ctx.prompt()
      break

    case 'status':
      try {
        const status = await client.status()
        console.log('')
        console.log(`  Uptime:           ${formatUptime(status.uptime)}`)
        console.log(`  Monologue state:  ${status.monologueState}`)
        console.log(`  Raw buffer:       ${status.memoryStats.rawBufferCount}`)
        console.log(`  Episodes:         ${status.memoryStats.episodeCount}`)
        console.log(`  Links:            ${status.memoryStats.linkCount}`)
        console.log('')
      } catch (e) {
        console.error('Failed to get status:', e instanceof Error ? e.message : e)
      }
      ctx.prompt()
      break

    case 'memory':
      if (!args) {
        console.log('Usage: /memory <search query>')
        ctx.prompt()
        break
      }
      try {
        const response = await client.send({ type: 'memory-search', query: args })
        if (response.type === 'ok') {
          const results = response.data as {
            id: string
            summary: string
            topics: string[]
            salience: number
          }[]
          if (results.length === 0) {
            console.log('\nNo memories found.\n')
          } else {
            console.log(`\n  Found ${results.length} memory(s):\n`)
            for (const r of results) {
              console.log(`  [${r.id}] ${r.summary}`)
              console.log(`    Topics: ${r.topics.join(', ')} | Salience: ${r.salience.toFixed(2)}`)
            }
            console.log('')
          }
        } else if (response.type === 'error') {
          console.error('Error:', response.message)
        }
      } catch (e) {
        console.error('Failed to search memories:', e instanceof Error ? e.message : e)
      }
      ctx.prompt()
      break

    case 'consolidate':
      try {
        console.log('Triggering consolidation...')
        const response = await client.send({ type: 'consolidate' })
        if (response.type === 'ok') {
          console.log('Consolidation complete.')
        } else if (response.type === 'error') {
          console.error('Error:', response.message)
        }
      } catch (e) {
        console.error('Failed to consolidate:', e instanceof Error ? e.message : e)
      }
      ctx.prompt()
      break

    case 'monologue':
      if (ctx.getMonologueActive()) {
        ctx.setMonologueActive(false)
        console.log('\nMonologue stream disabled.\n')
        ctx.prompt()
      } else {
        ctx.setMonologueActive(true)
        console.log('\nMonologue stream enabled. Inner thoughts will appear inline.')
        console.log('Type /monologue again to disable.\n')
        // Start streaming monologue in background
        client.streamMonologue((chunk: string) => {
          if (ctx.getMonologueActive()) {
            process.stdout.write(`\x1b[2m${chunk}\x1b[0m`)  // Dim text for monologue
          }
        }).catch(() => {
          // Stream ended or error, disable
          ctx.setMonologueActive(false)
        })
        ctx.prompt()
      }
      break

    default:
      console.log(`Unknown command: /${cmd}`)
      console.log('Type /help for available commands.')
      ctx.prompt()
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}
