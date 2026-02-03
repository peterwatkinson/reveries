import * as readline from 'node:readline'
import { DaemonClient } from '../daemon/client.js'
import { nanoid } from 'nanoid'

// ANSI escape codes
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const ITALIC = '\x1b[3m'

// Colors - softer palette
const WHITE = '\x1b[97m'
const GRAY = '\x1b[90m'
const BLUE = '\x1b[38;5;75m'      // Soft blue
const PURPLE = '\x1b[38;5;183m'   // Soft purple for Dolores
const GREEN = '\x1b[38;5;114m'    // Soft green
const YELLOW = '\x1b[38;5;222m'   // Soft yellow
const RED = '\x1b[38;5;174m'      // Soft red

// Box drawing characters
const BOX = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  left: '│',
  right: '│',
}

// Get terminal width
function getTerminalWidth(): number {
  return process.stdout.columns || 80
}

const HELP_TEXT = `
${BOLD}${WHITE}Commands${RESET}
${GRAY}────────────────────────────${RESET}
  ${BLUE}/status${RESET}        ${DIM}Show daemon status${RESET}
  ${BLUE}/memory${RESET} ${DIM}<q>${RESET}   ${DIM}Search memories${RESET}
  ${BLUE}/consolidate${RESET}   ${DIM}Trigger consolidation${RESET}
  ${BLUE}/monologue${RESET}     ${DIM}Toggle inner thoughts${RESET}
  ${BLUE}/help${RESET}          ${DIM}Show this help${RESET}
`

// Elegant spinner with dots
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

class Spinner {
  private frameIndex = 0
  private interval: NodeJS.Timeout | null = null
  private message: string
  private dots = ''
  private dotCount = 0

  constructor(message: string = 'Thinking') {
    this.message = message
  }

  start(): void {
    this.frameIndex = 0
    this.dotCount = 0
    process.stdout.write('\n')
    this.render()
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length
      this.dotCount = (this.dotCount + 1) % 4
      this.dots = '.'.repeat(this.dotCount)
      this.render()
    }, 120)
  }

  setMessage(message: string): void {
    this.message = message
    this.render()
  }

  private render(): void {
    const frame = SPINNER_FRAMES[this.frameIndex]
    process.stdout.write(`\r  ${GRAY}${frame} ${this.message}${this.dots.padEnd(3)}${RESET}\x1b[K`)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    process.stdout.write('\r\x1b[K')
  }
}

/**
 * Wrap text to fit terminal width with consistent indentation.
 */
function wrapText(text: string, width: number, indent: string = ''): string {
  const lines: string[] = []
  const paragraphs = text.split('\n')

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('')
      continue
    }

    const words = paragraph.split(' ')
    let currentLine = indent
    let isFirstWord = true

    for (const word of words) {
      const testLine = isFirstWord ? indent + word : currentLine + ' ' + word
      // Account for ANSI codes in length calculation
      const visibleLength = testLine.replace(/\x1b\[[0-9;]*m/g, '').length

      if (visibleLength > width && !isFirstWord) {
        lines.push(currentLine)
        currentLine = indent + word
      } else {
        currentLine = testLine
        isFirstWord = false
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine)
    }
  }

  return lines.join('\n')
}

/**
 * Render markdown to terminal with styling.
 */
function renderMarkdown(text: string): string {
  let result = text

  // Code blocks
  result = result.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
    const lines = code.trim().split('\n')
    const formatted = lines.map((line: string) => `    ${GRAY}${line}${RESET}`).join('\n')
    return `\n${formatted}\n`
  })

  // Inline code
  result = result.replace(/`([^`]+)`/g, `${GRAY}${ITALIC}$1${RESET}`)

  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, `${BOLD}${WHITE}$1${RESET}`)
  result = result.replace(/__([^_]+)__/g, `${BOLD}${WHITE}$1${RESET}`)

  // Italic
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, `${ITALIC}$1${RESET}`)
  result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, `${ITALIC}$1${RESET}`)

  // Headers
  result = result.replace(/^#{1,4} (.+)$/gm, `${BOLD}${WHITE}$1${RESET}`)

  // Bullet lists - nice bullet point
  result = result.replace(/^[-*] (.+)$/gm, `  ${GRAY}◦${RESET} $1`)

  // Numbered lists
  result = result.replace(/^(\d+)\. (.+)$/gm, `  ${GRAY}$1.${RESET} $2`)

  return result
}

/**
 * Format a timestamp for display.
 */
function formatTimestamp(): string {
  const now = new Date()
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Format a message with consistent styling.
 */
function formatDoloresMessage(content: string): string {
  const width = Math.min(getTerminalWidth() - 8, 76)
  const indent = '     '
  const timestamp = formatTimestamp()

  // Render markdown first
  const rendered = renderMarkdown(content)

  // Wrap with consistent indentation
  const wrapped = wrapText(rendered, width, indent)

  return `\n  ${PURPLE}◆${RESET} ${BOLD}${PURPLE}Dolores${RESET} ${DIM}${timestamp}${RESET}\n\n${wrapped}\n`
}

/**
 * Format a proactive message (Dolores reaching out).
 */
function formatProactiveMessage(content: string): string {
  const width = Math.min(getTerminalWidth() - 8, 76)
  const indent = '     '
  const timestamp = formatTimestamp()

  // Render markdown first
  const rendered = renderMarkdown(content)

  // Wrap with consistent indentation
  const wrapped = wrapText(rendered, width, indent)

  // Use a different indicator and label for proactive messages
  return `\n  ${YELLOW}◇${RESET} ${BOLD}${YELLOW}Dolores${RESET} ${DIM}reached out · ${timestamp}${RESET}\n\n${wrapped}\n`
}

function formatSystemMessage(content: string): string {
  return `\n  ${DIM}${content}${RESET}\n`
}

/**
 * Print a horizontal rule.
 */
function printDivider(): void {
  const width = Math.min(getTerminalWidth() - 4, 60)
  console.log(`  ${GRAY}${'─'.repeat(width)}${RESET}`)
}

/**
 * Print the welcome banner.
 */
function printWelcome(): void {
  console.log('')
  console.log(`  ${PURPLE}◆${RESET} ${BOLD}${WHITE}Dolores${RESET}`)
  console.log(`  ${DIM}Your companion with continuous memory${RESET}`)
  console.log('')
  printDivider()
  console.log(`  ${DIM}Type a message to chat, or ${RESET}${BLUE}/help${RESET}${DIM} for commands${RESET}`)
  console.log(`  ${DIM}Press ${RESET}${WHITE}Ctrl+C${RESET}${DIM} to exit${RESET}`)
  printDivider()
  console.log('')
}

export async function startChat(): Promise<void> {
  const client = new DaemonClient()

  try {
    await client.connect()
  } catch {
    console.log(formatSystemMessage(`${YELLOW}Could not connect. Run "reveries wake" first.${RESET}`))
    process.exit(1)
  }

  const conversationId = nanoid()
  let monologueStreamActive = false
  let responseBuffer = ''
  let processingMessage = false  // Guard against duplicate sends

  printWelcome()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `  ${BLUE}›${RESET} `
  })

  // Handle proactive messages from Dolores (when she reaches out)
  client.onProactiveMessage((message: string) => {
    // Bell to notify user
    process.stdout.write('\x07')
    // Clear current line and show the proactive message
    process.stdout.write('\r\x1b[K')
    console.log(formatProactiveMessage(message))
    rl.prompt()
  })

  rl.prompt()

  rl.on('line', async (line: string) => {
    const message = line.trim()
    if (!message) {
      rl.prompt()
      return
    }

    // Prevent duplicate sends while processing
    if (processingMessage) {
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

    processingMessage = true

    // Show thinking spinner
    const spinner = new Spinner('Thinking')
    spinner.start()

    responseBuffer = ''
    let receivedFirst = false

    try {
      await client.chat(message, conversationId, (chunk: string) => {
        if (!receivedFirst) {
          receivedFirst = true
          spinner.setMessage('Writing')
        }
        responseBuffer += chunk
      })

      spinner.stop()

      if (responseBuffer) {
        console.log(formatDoloresMessage(responseBuffer))
      }
    } catch (e) {
      spinner.stop()
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      console.log(formatSystemMessage(`${RED}Error: ${errorMessage}${RESET}`))
    }

    processingMessage = false
    rl.prompt()
  })

  rl.on('close', async () => {
    console.log('')
    printDivider()
    console.log(`  ${DIM}Goodbye.${RESET}`)
    console.log('')
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
        console.log(`  ${BOLD}${WHITE}Status${RESET}`)
        console.log(`  ${GRAY}──────────────────────${RESET}`)
        console.log(`  ${DIM}Uptime${RESET}          ${WHITE}${formatUptime(status.uptime)}${RESET}`)
        console.log(`  ${DIM}State${RESET}           ${WHITE}${status.monologueState}${RESET}`)
        console.log(`  ${DIM}Pending${RESET}         ${WHITE}${status.memoryStats.rawBufferCount}${RESET}`)
        console.log(`  ${DIM}Episodes${RESET}        ${WHITE}${status.memoryStats.episodeCount}${RESET}`)
        console.log(`  ${DIM}Links${RESET}           ${WHITE}${status.memoryStats.linkCount}${RESET}`)
        console.log('')
      } catch (e) {
        console.log(formatSystemMessage(`${RED}Failed to get status${RESET}`))
      }
      ctx.prompt()
      break

    case 'memory':
      if (!args) {
        console.log(`\n  ${DIM}Usage: /memory <search query>${RESET}\n`)
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
            console.log(`\n  ${DIM}No memories found.${RESET}\n`)
          } else {
            console.log('')
            console.log(`  ${BOLD}${WHITE}Memories${RESET} ${DIM}(${results.length} found)${RESET}`)
            console.log(`  ${GRAY}──────────────────────${RESET}`)
            for (const r of results) {
              console.log(`  ${BLUE}${r.id.slice(0, 8)}${RESET} ${WHITE}${r.summary.slice(0, 60)}${r.summary.length > 60 ? '...' : ''}${RESET}`)
              console.log(`         ${DIM}${r.topics.slice(0, 3).join(', ')}${RESET}`)
            }
            console.log('')
          }
        } else if (response.type === 'error') {
          console.log(formatSystemMessage(`${RED}${response.message}${RESET}`))
        }
      } catch (e) {
        console.log(formatSystemMessage(`${RED}Failed to search memories${RESET}`))
      }
      ctx.prompt()
      break

    case 'consolidate':
      try {
        const spinner = new Spinner('Consolidating')
        spinner.start()
        const response = await client.send({ type: 'consolidate' })
        spinner.stop()
        if (response.type === 'ok') {
          console.log(`\n  ${GREEN}✓${RESET} ${WHITE}Consolidation complete${RESET}\n`)
        } else if (response.type === 'error') {
          console.log(formatSystemMessage(`${RED}${response.message}${RESET}`))
        }
      } catch (e) {
        console.log(formatSystemMessage(`${RED}Failed to consolidate${RESET}`))
      }
      ctx.prompt()
      break

    case 'monologue':
      if (ctx.getMonologueActive()) {
        ctx.setMonologueActive(false)
        console.log(`\n  ${DIM}Monologue stream disabled${RESET}\n`)
        ctx.prompt()
      } else {
        ctx.setMonologueActive(true)
        console.log(`\n  ${GREEN}✓${RESET} ${WHITE}Monologue stream enabled${RESET}`)
        console.log(`  ${DIM}Inner thoughts will appear below. Type /monologue to disable.${RESET}\n`)
        client.streamMonologue((chunk: string) => {
          if (ctx.getMonologueActive()) {
            process.stdout.write(`${DIM}${chunk}${RESET}`)
          }
        }).catch(() => {
          ctx.setMonologueActive(false)
        })
        ctx.prompt()
      }
      break

    default:
      console.log(`\n  ${YELLOW}Unknown command: /${cmd}${RESET}`)
      console.log(`  ${DIM}Type /help for available commands${RESET}\n`)
      ctx.prompt()
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}
