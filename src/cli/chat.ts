import * as readline from 'node:readline'
import { DaemonClient } from '../daemon/client.js'
import { nanoid } from 'nanoid'

export async function startChat(): Promise<void> {
  const client = new DaemonClient()

  try {
    await client.connect()
  } catch {
    console.log('Could not connect to daemon. Run "reveries wake" first.')
    process.exit(1)
  }

  const conversationId = nanoid()
  console.log('Connected to Dolores. Type your message and press Enter. Ctrl+C to exit.\n')

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
