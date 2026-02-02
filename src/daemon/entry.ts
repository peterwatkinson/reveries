import { DaemonServer } from './server.js'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'

const PID_FILE = '/tmp/reveries.pid'

const server = new DaemonServer()

async function main(): Promise<void> {
  await server.start()
  writeFileSync(PID_FILE, process.pid.toString())
}

async function shutdown(): Promise<void> {
  await server.stop()
  if (existsSync(PID_FILE)) {
    unlinkSync(PID_FILE)
  }
  process.exit(0)
}

function cleanupPidFile(): void {
  if (existsSync(PID_FILE)) {
    unlinkSync(PID_FILE)
  }
}

process.on('SIGTERM', () => {
  shutdown().catch(() => process.exit(1))
})

process.on('SIGINT', () => {
  shutdown().catch(() => process.exit(1))
})

// Clean up PID file on any exit (including shutdown via IPC)
process.on('exit', cleanupPidFile)

main().catch((err) => {
  console.error('Failed to start daemon:', err)
  process.exit(1)
})
