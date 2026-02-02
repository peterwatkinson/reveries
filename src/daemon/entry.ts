import { DaemonServer } from './server.js'
import { DaemonLifecycle } from './lifecycle.js'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'

const PID_FILE = '/tmp/reveries.pid'

async function main(): Promise<void> {
  const lifecycle = new DaemonLifecycle()
  await lifecycle.wake()

  const server = new DaemonServer()
  server.init({
    graph: lifecycle.graph,
    db: lifecycle.db,
    selfModel: lifecycle.selfModelManager.getOrCreate(),
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
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE)
    process.exit(0)
  }

  process.on('SIGTERM', () => {
    shutdown().catch(() => process.exit(1))
  })

  process.on('SIGINT', () => {
    shutdown().catch(() => process.exit(1))
  })

  process.on('exit', () => {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE)
  })
}

main().catch((err) => {
  console.error('Daemon failed to start:', err)
  process.exit(1)
})
