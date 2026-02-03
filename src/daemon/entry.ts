import { DaemonServer } from './server.js'
import { DaemonLifecycle } from './lifecycle.js'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { getPidPath } from './protocol.js'

const PID_FILE = getPidPath()

function cleanupPidFile(): void {
  try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE) } catch {}
}

process.on('uncaughtException', (err) => {
  console.error('Daemon uncaught exception:', err)
  cleanupPidFile()
  process.exit(1)
})

process.on('unhandledRejection', (err) => {
  console.error('Daemon unhandled rejection:', err)
  cleanupPidFile()
  process.exit(1)
})

async function main(): Promise<void> {
  const lifecycle = new DaemonLifecycle()
  await lifecycle.wake()

  const server = new DaemonServer()
  server.init({
    graph: lifecycle.graph,
    db: lifecycle.db,
    selfModel: lifecycle.selfModelManager.getOrCreate(),
    selfModelManager: lifecycle.selfModelManager,
    config: lifecycle.config
  })
  server.setMonologue(lifecycle.monologue)
  server.setConsolidation(lifecycle.consolidation)

  await server.start()
  await lifecycle.monologue.start()

  writeFileSync(PID_FILE, process.pid.toString())

  const shutdown = async () => {
    await server.stop()
    await lifecycle.sleep()
    cleanupPidFile()
    process.exit(0)
  }

  process.on('SIGTERM', () => {
    shutdown().catch(() => { cleanupPidFile(); process.exit(1) })
  })

  process.on('SIGINT', () => {
    shutdown().catch(() => { cleanupPidFile(); process.exit(1) })
  })

  process.on('exit', cleanupPidFile)
}

main().catch((err) => {
  console.error('Daemon failed to start:', err)
  process.exit(1)
})
