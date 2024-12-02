#! /usr/bin/env node
import { Command } from 'commander'
import { startInteractiveMode } from './commands/chat.js'
import { doTask } from './commands/tasks.js'

const program = new Command()

program
    .name('nut')
    .description('command line tool that recursively solves a complex problem.')

program
    .command('do')
    .alias('create')
    .argument('<string>', 'prompt')
    .option('-o, --output <folder>', 'output folder', './')
    .option('-i, --input <pattern>', 'input file glob pattern', '')
    .option('-f, --files <path>', 'list of files', '')
    .option('-m, --model <name>', 'model name', 'llama3.1')
    .option('-v, --verbose', 'verbose', false)
    .option('-d, --debug', 'debug log level', false)
    .option('-l, --log <path>', 'log pipe', false)
    .option('-s, --skip', 'skip existing files. only write new files.', false)
    .option('--system <path>', 'path to system prompt file')
    .action(doTask)

program
    .command('interactive')
    .alias('i')
    .alias('chat')
    .description('start interactive mode')
    .option('-m, --model <name>', 'model name', 'llama3.1')
    .option('-v, --verbose', 'verbose', false)
    .option('-i, --input <pattern>', 'include files', '**/*.*')
    .option('--system <path>', 'path to system prompt file')
    .option('-d, --debug', 'debug log level', false)
    .action(startInteractiveMode)

program.parse(process.argv)
