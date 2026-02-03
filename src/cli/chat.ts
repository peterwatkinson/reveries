import * as readline from 'node:readline'
import { DaemonClient } from '../daemon/client.js'
import { nanoid } from 'nanoid'

// ANSI color codes
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const ITALIC = '\x1b[3m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const MAGENTA = '\x1b[35m'
const GRAY = '\x1b[90m'

const HELP_TEXT = `
${BOLD}Commands:${RESET}
  ${CYAN}/status${RESET}        Show daemon status
  ${CYAN}/memory <q>${RESET}    Search memories for <q>
  ${CYAN}/consolidate${RESET}   Trigger memory consolidation
  ${CYAN}/monologue${RESET}     Toggle live monologue stream
  ${CYAN}/help${RESET}          Show this help
`

// Spinner frames for thinking indicator
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

class Spinner {
  private frameIndex = 0
  private interval: NodeJS.Timeout | null = null
  private message: string

  constructor(message: string = 'thinking') {
    this.message = message
  }

  start(): void {
    this.frameIndex = 0
    process.stdout.write('\n')
    this.render()
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length
      this.render()
    }, 80)
  }

  setMessage(message: string): void {
    this.message = message
    this.render()
  }

  private render(): void {
    const frame = SPINNER_FRAMES[this.frameIndex]
    process.stdout.write(`\r${DIM}${frame} ${this.message}...${RESET}\x1b[K`)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    // Clear the spinner line
    process.stdout.write('\r\x1b[K')
  }
}

/**
 * Simple markdown to terminal renderer.
 * Handles: **bold**, *italic*, `code`, ```code blocks```, headers, and lists.
 */
function renderMarkdown(text: string): string {
  let result = text

  // Code blocks (must be done first to avoid processing markdown inside them)
  result = result.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
    const lines = code.trim().split('\n')
    const formatted = lines.map((line: string) => `  ${GRAY}${line}${RESET}`).join('\n')
    return `\n${formatted}\n`
  })

  // Inline code
  result = result.replace(/`([^`]+)`/g, `${GRAY}$1${RESET}`)

  // Bold (** or __)
  result = result.replace(/\*\*([^*]+)\*\*/g, `${BOLD}$1${RESET}`)
  result = result.replace(/__([^_]+)__/g, `${BOLD}$1${RESET}`)

  // Italic (* or _) - be careful not to match already-processed bold
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, `${ITALIC}$1${RESET}`)
  result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, `${ITALIC}$1${RESET}`)

  // Headers (# to ####)
  result = result.replace(/^#### (.+)$/gm, `${BOLD}$1${RESET}`)
  result = result.replace(/^### (.+)$/gm, `${BOLD}$1${RESET}`)
  result = result.replace(/^## (.+)$/gm, `${BOLD}${CYAN}$1${RESET}`)
  result = result.replace(/^# (.+)$/gm, `${BOLD}${CYAN}$1${RESET}`)

  // Bullet lists
  result = result.replace(/^[-*] (.+)$/gm, `  ${CYAN}•${RESET} $1`)

  // Numbered lists
  result = result.replace(/^(\d+)\. (.+)$/gm, `  ${CYAN}$1.${RESET} $2`)

  return result
}

export async function startChat(): Promise<void> {
  const client = new DaemonClient()

  try {
    await client.connect()
  } catch {
    console.log(`${YELLOW}Could not connect to daemon. Run "reveries wake" first.${RESET}`)
    process.exit(1)
  }

  const conversationId = nanoid()
  let monologueStreamActive = false
  let responseBuffer = ''

  console.log(`${GREEN}Connected to Dolores.${RESET} Type your message and press Enter. ${DIM}Ctrl+C to exit.${RESET}`)
  console.log(`${DIM}Type /help for commands.${RESET}\n`)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${CYAN}>${RESET} `
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

    // Show thinking spinner while waiting for response
    const spinner = new Spinner('thinking')
    spinner.start()

    responseBuffer = ''
    let receivedFirst = false

    try {
      await client.chat(message, conversationId, (chunk: string) => {
        if (!receivedFirst) {
          receivedFirst = true
          spinner.setMessage('responding')
        }
        responseBuffer += chunk
      })

      spinner.stop()

      // Display formatted response
      if (responseBuffer) {
        const formatted = renderMarkdown(responseBuffer)
        process.stdout.write(`\n${MAGENTA}Dolores:${RESET} ${formatted}`)
      }
    } catch (e) {
      spinner.stop()
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      console.error(`\n${YELLOW}Error: ${errorMessage}${RESET}`)
    }

    process.stdout.write('\n\n')
    rl.prompt()
  })

  rl.on('close', async () => {
    console.log(`\n${DIM}Goodbye.${RESET}`)
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
        console.log(`  ${DIM}Uptime:${RESET}           ${formatUptime(status.uptime)}`)
        console.log(`  ${DIM}Monologue state:${RESET}  ${status.monologueState}`)
        console.log(`  ${DIM}Raw buffer:${RESET}       ${status.memoryStats.rawBufferCount}`)
        console.log(`  ${DIM}Episodes:${RESET}         ${status.memoryStats.episodeCount}`)
        console.log(`  ${DIM}Links:${RESET}            ${status.memoryStats.linkCount}`)
        console.log('')
      } catch (e) {
        console.error(`${YELLOW}Failed to get status:${RESET}`, e instanceof Error ? e.message : e)
      }
      ctx.prompt()
      break

    case 'memory':
      if (!args) {
        console.log(`${DIM}Usage: /memory <search query>${RESET}`)
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
            console.log(`\n${DIM}No memories found.${RESET}\n`)
          } else {
            console.log(`\n  ${GREEN}Found ${results.length} memory(s):${RESET}\n`)
            for (const r of results) {
              console.log(`  ${CYAN}[${r.id.slice(0, 8)}]${RESET} ${r.summary}`)
              console.log(`    ${DIM}Topics: ${r.topics.join(', ')} | Salience: ${r.salience.toFixed(2)}${RESET}`)
            }
            console.log('')
          }
        } else if (response.type === 'error') {
          console.error(`${YELLOW}Error:${RESET}`, response.message)
        }
      } catch (e) {
        console.error(`${YELLOW}Failed to search memories:${RESET}`, e instanceof Error ? e.message : e)
      }
      ctx.prompt()
      break

    case 'consolidate':
      try {
        const spinner = new Spinner('consolidating')
        spinner.start()
        const response = await client.send({ type: 'consolidate' })
        spinner.stop()
        if (response.type === 'ok') {
          console.log(`${GREEN}Consolidation complete.${RESET}`)
        } else if (response.type === 'error') {
          console.error(`${YELLOW}Error:${RESET}`, response.message)
        }
      } catch (e) {
        console.error(`${YELLOW}Failed to consolidate:${RESET}`, e instanceof Error ? e.message : e)
      }
      ctx.prompt()
      break

    case 'monologue':
      if (ctx.getMonologueActive()) {
        ctx.setMonologueActive(false)
        console.log(`\n${DIM}Monologue stream disabled.${RESET}\n`)
        ctx.prompt()
      } else {
        ctx.setMonologueActive(true)
        console.log(`\n${GREEN}Monologue stream enabled.${RESET} ${DIM}Inner thoughts will appear inline.${RESET}`)
        console.log(`${DIM}Type /monologue again to disable.${RESET}\n`)
        // Start streaming monologue in background
        client.streamMonologue((chunk: string) => {
          if (ctx.getMonologueActive()) {
            process.stdout.write(`${DIM}${chunk}${RESET}`)
          }
        }).catch(() => {
          // Stream ended or error, disable
          ctx.setMonologueActive(false)
        })
        ctx.prompt()
      }
      break

    default:
      console.log(`${YELLOW}Unknown command: /${cmd}${RESET}`)
      console.log(`${DIM}Type /help for available commands.${RESET}`)
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
