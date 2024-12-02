import fs from 'node:fs'
import { glob } from 'glob'
import { Command } from 'commander'
import readline from 'node:readline'
import { runTaskStreaming, Task, createOllamaModel, createChatHandler, TaskOptions } from '../lib.js'
import path from 'node:path'

let globalState = {
    history: [],
    systemPrompt: '',
    files: [],
    model: createOllamaModel({
        model: 'llama3.1'
    })
}

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

function loadSystemPrompt(path) {
    try {
        return fs.readFileSync(path, 'utf8')
    } catch (error) {
        console.error(`Failed to load system prompt from ${path}:`, error.message)
        process.exit(1)
    }
}

const interactiveCommands = new Command()
    .name('interactive')
    .description('Interactive chat commands')

interactiveCommands.exitOverride();

interactiveCommands
    .command('verbose')
    .argument('[value]', 'true or false')
    .description('Toggle verbose mode')
    .action((value) => {
        if (value === undefined) {
            console.log(`Verbose mode: ${globalState.verbose}`)
            return
        }
        globalState.verbose = value === 'true'
        console.log(`Verbose mode: ${globalState.verbose}`)
    })

interactiveCommands
    .command('context')
    .description('Show current context files')
    .action((options, command) => {
        console.log('\nCurrent Context:')
        if (globalState.files.length === 0) {
            console.log('No files in context')
            return
        }
        globalState.files.forEach(file => {
            const relativePath = path.relative(process.cwd(), file)
            console.log(`- ${relativePath}`)
        })
    })

interactiveCommands
    .command('system')
    .description('Show current system prompt')
    .action((options, command) => {
        if (!globalState.systemPrompt) {
            console.log('No system prompt set')
            return
        }
        console.log('\nCurrent System Prompt:')
        console.log(globalState.systemPrompt)
    })

interactiveCommands
    .command('add')
    .argument('<glob>', 'File glob pattern to add')
    .description('Add files to context')
    .action((glob, options, command) => {
        const newFiles = glob.sync(glob, { ignore: 'node_modules/**' })
        globalState.files.push(...newFiles)
        console.log(`Added ${newFiles.length} files to context`)
    })

interactiveCommands
    .command('remove')
    .argument('<pattern>', 'Pattern to match files to remove')
    .description('Remove files from context')
    .action((pattern, options, command) => {
        const before = globalState.files.length
        globalState.files = globalState.files.filter(f => !f.includes(pattern))
        console.log(`Removed ${before - globalState.files.length} files from context`)
    })

interactiveCommands
    .command('model')
    .argument('[name]', 'Model name to switch to')
    .description('Show or change the current model')
    .action((name, options, command) => {
        if (!name) {
            console.log(`Current model: ${globalState.model}`)
            return
        }
        globalState.model = name
        console.log(`Switched to model: ${name}`)
    })

interactiveCommands
    .command('history')
    .description('Show chat history')
    .action((options, command) => {
        if (!globalState.history?.length) {
            console.log('No chat history')
            return
        }
        globalState.history.forEach((entry, i) => {
            console.log(`\n[${i + 1}] User: ${entry.prompt}`)
            console.log(`    AI: ${entry.response.substring(0, 100)}...`)
        })
    })
    
export async function startInteractiveMode(options = {}) {
    const model = createOllamaModel(options)
    const systemPrompt = options.system ? loadSystemPrompt(options.system) : undefined
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    const chatConsoleLogging = createChatHandler(process.stdout)

    const files = await getFiles(options)

    Object.assign(globalState, {
        verbose: options.verbose,
        files,
        systemPrompt,
        model
    })

    const handleCommand = (input) => {
        try {
            interactiveCommands.parse(input.split(' '), { from: 'user' })
            return true
        } catch (err) {
            if (!input.includes('--help')) {
                console.error('Invalid command. Use $help for available commands')
            }
            return true
        }
    }

    const askQuestion = () => {
        rl.question('\nEnter your prompt (or "exit" to quit, $help for commands):\n> ', async (input) => {
            const trimmedInput = input.trim()

            if (trimmedInput.toLowerCase() === 'exit') {
                rl.close()
                return
            }

            if (trimmedInput.startsWith('$')) {
                handleCommand(trimmedInput.substring(1))
                askQuestion()
                return
            }

            const task = new Task({
                prompt: trimmedInput,
                files: globalState.files,
                systemPrompt: globalState.systemPrompt
            })

            if (options.debug) {
                console.log(task)
            }

            const _options = new TaskOptions({
                model: globalState.model,
                // logStream: process.stdout,
                tick: (message, raw) => {
                    if (globalState.debug) {
                        process.stdout.write(message)
                        return
                    }

                    if (globalState.verbose) {
                        process.stdout.write(`${raw}\n`)
                        return
                    }

                    chatConsoleLogging(message)
                }
            })

            await runTaskStreaming(task, _options)

            askQuestion()
        })
    }

    console.log('Interactive mode started. Type "$help" for commands or "exit" to quit.')
    interactiveCommands.commands.find(cmd => cmd.name() === 'context').action()
    askQuestion()
}
