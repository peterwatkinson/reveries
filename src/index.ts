#!/usr/bin/env node

import { Command } from 'commander'
import {
  wakeCommand,
  sleepCommand,
  statusCommand,
  defaultCommand,
  consolidateCommand,
  memoryCommand,
  monologueCommand
} from './cli/commands.js'

const program = new Command()

program
  .name('reveries')
  .description('A daemon-based CLI chat application with biologically-inspired episodic memory')
  .version('1.0.0')
  .action(async () => {
    await defaultCommand()
  })

program
  .command('wake')
  .description('Start the daemon as a detached background process')
  .option('--config <path>', 'Path to config file')
  .action(async (options: { config?: string }) => {
    await wakeCommand(options)
  })

program
  .command('sleep')
  .description('Send shutdown signal to daemon')
  .action(async () => {
    await sleepCommand()
  })

program
  .command('status')
  .description('Query daemon for status')
  .action(async () => {
    await statusCommand()
  })

program
  .command('consolidate')
  .description('Trigger memory consolidation')
  .action(async () => {
    await consolidateCommand()
  })

program
  .command('memory')
  .description('Show memory statistics')
  .action(async () => {
    await memoryCommand()
  })

program
  .command('monologue')
  .description('Stream live monologue or view history')
  .option('--history', 'Show monologue history')
  .option('--since <timestamp>', 'Show history since timestamp (ISO format)')
  .action(async (options: { history?: boolean; since?: string }) => {
    await monologueCommand(options)
  })

program.parseAsync(process.argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
