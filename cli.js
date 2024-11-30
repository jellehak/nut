#! /usr/bin/env node
import fs from 'node:fs'
import { glob } from 'glob'
import { Command } from 'commander'
import _colors from "ansi-colors"
import readline from 'node:readline'
import { createDeepPath, runTaskStreaming, Task, createOllamaModel, runTasksInSeries, createChatHandler } from './lib.js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

function getFiles(options = {}) {
    if (options.input) {
        return glob.sync(options.input, { 
            ignore: 'node_modules/**'
         })
    }
    if (options.files) {
        const content = fs.readFileSync(options.files, 'utf8')
        const files = content.split('\n').filter(Boolean)
        return files
    }
    return []
}

const program = new Command()

program
    .name('nut')
    .description('command line tool that recursively solves a complex problem.')

program.command('do')
    .argument('<string>', 'prompt')
    .option('-o, --output <folder>', 'output folder', './')
    .option('-i, --input <pattern>', 'input file glob pattern', '')
    .option('-f, --files <path>', 'list of files', '')
    .option('-m, --model <name>', 'model name', 'llama3.1')
    .option('-v, --verbose', 'verbose', false)
    .option('-d, --debug', 'debug log level', false)
    .option('-l, --log <path>', 'log pipe', false)
    .option('-s, --skip', 'skip existing files. only write new files.', false)
    .action(doTask)

program.command('replay')
    .description('replay a log')
    .argument('<string>', 'log file')
    .action((str, options) => {
        console.log(str)
    })

program
    .command('interactive')
    .alias('i')
    .description('start interactive mode')
    .option('-m, --model <name>', 'model name', 'llama3.1')
    .option('-v, --verbose', 'verbose', false)
    .option('-i, --input <pattern>', 'include files', '**/*.*')
    .action((options) => {
        startInteractiveMode(options)
    })

program.parse(process.argv)

const interactiveCommands = {
    verbose: {
        set: (state, value) => {
            state.verbose = value === 'true'
            console.log(`Verbose mode: ${state.verbose}`)
        },
        get: (state) => console.log(`Verbose mode: ${state.verbose}`)
    },
    context: {
        get: (state) => {
            console.log('\nCurrent Context:')
            if (state.files.length === 0) {
                console.log('No files in context')
                return
            }
            state.files.forEach(file => {
                const relativePath = path.relative(process.cwd(), file)
                console.log(`- ${relativePath}`)
            })
        }
    },
    help: {
        get: () => {
            console.log('\nAvailable Commands:')
            console.log('$verbose true|false  - Toggle verbose mode')
            console.log('$context            - Show current context files')
            console.log('$help               - Show this help message')
            console.log('exit                - Exit interactive mode\n')
        }
    }
}

async function startInteractiveMode(options = {}) {
    const model = createOllamaModel(options)
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    const chatConsoleLogging = createChatHandler(process.stdout)
  
    const files = await getFiles(options)
    console.log({files, options})
    const state = {
        verbose: options.verbose,
        files
    }

    const handleCommand = (input) => {
        const [cmd, ...args] = input.slice(1).split(' ')
        const command = interactiveCommands[cmd]
    
        if (!command) {
            console.log(`Unknown command: ${cmd}`)
            interactiveCommands.help.get()
            return true
        }

        if (args.length === 0) {
            command.get?.(state)
        } else {
            command.set?.(state, args[0])
        }
        return true
    }

    const askQuestion = () => {
        rl.question('\nEnter your prompt (or "exit" to quit, $help for commands):\n> ', async (input) => {
            const trimmedInput = input.trim()
      
            if (trimmedInput.toLowerCase() === 'exit') {
                rl.close()
                return
            }

            if (trimmedInput.startsWith('$')) {
                handleCommand(trimmedInput)
                askQuestion()
                return
            }

            const task = new Task({ 
                prompt: trimmedInput, 
                files: state.files 
            })

            await runTaskStreaming(task, {
                model,
                tick: (ctx, raw) => {
                    if (state.verbose) {
                        process.stdout.write(`${raw}\n`)
                        return
                    }
                    chatConsoleLogging(ctx)
                }
            })

            askQuestion()
        })
    }

    console.log('Interactive mode started. Type "$help" for commands or "exit" to quit.')
    interactiveCommands.context.get(state)
    askQuestion()
}

async function doTask(task = "", options = {}) {
    const model = createOllamaModel(options)
    const files = await getFiles(options)
    const tasks = files.length ?
        files.map((file) => (new Task({ files:[file], prompt: task }))) :
        [new Task({ prompt: task })]

    if (options.output) {
        if (!fs.existsSync(options.output)) {
            fs.mkdirSync(options.output, { recursive: true })
        }
    }

    if (!tasks.length) {
        console.log('No tasks found')
        process.exit(0)
    }

    console.log(`Using model: ${options.model}`)
    console.log(`Work divided over ${tasks.length} tasks`)
    if (options.log) {
        console.log(`using log file: ${options.log}`)
        createDeepPath(options.log)
    }
    console.log(`===\n`)

    const logStream = options.log ? 
        fs.createWriteStream(options.log) : 
        options.debug ? process.stdout : { write: () => {} }

    const chatConsoleLogging = createChatHandler(process.stdout)
    
    function tick(ctx, raw) {
        if (options.verbose) {
            process.stdout.write(`${raw}\n`)
            return
        }
        chatConsoleLogging(ctx)
    }

    const tasksFn = tasks.map((task, index) => async () => {
        console.log(`Processing task ${index + 1}/${tasks.length}`)
        
        if (typeof logStream.write === 'function') {
            logStream.write(`# Task ${index}\n`)
        }

        await runTaskStreaming(task, {
            logStream,
            tick,
            model,
            createWriteStream: (file) => {
                return fs.createWriteStream(`${options.output}${file}`)
            }
        })

        if (typeof logStream.write === 'function') {
            logStream.write(`\n\n`)
        }
    })

    await runTasksInSeries(tasksFn)
    console.log('\nAll Done')
}

