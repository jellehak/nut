#! /usr/bin/env node
import fs from 'node:fs'
import { generateText, streamText, tool } from "ai"
import { createOllama } from 'ollama-ai-provider'
import { glob } from 'glob'
import { Command } from 'commander'
import cliProgress from 'cli-progress'
import _colors from "ansi-colors"
import { createDeepPath, runTaskStreaming } from './lib.js'

class FakeBar {
    constructor() {
        this.bars = []
    }

    create(total, value, options) {
        const bar = {
            total,
            value,
            stop() { },
            update() { },
            increment: () => {
                bar.value += 1
            }
        }
        this.bars.push(bar)
        return bar
    }

    stop() {
        this.bars.forEach(bar => { })
    }
}

function getFiles(options = {}) {
    if (options.input) {
        return glob.sync(options.input, { ignore: 'node_modules/**' })
    }
    if (options.files) {
        const content = fs.readFileSync(options.files, 'utf8')
        const files = content.split('\n').filter(Boolean)
        return files
    }
    // Create single empty task
    return []
}

// Initialize commander
const program = new Command()

program
    .name('nut')
    .description('command line tool that recursively solves a complex problem.')

program.command('do')
    .argument('<string>', 'prompt')
    .option('-o, --output <folder>', 'output folder', './')
    .option('-i, --input <pattern>', 'input file glob pattern', '')
    .option('-f, --files <path>', 'list of files', '')
    .option('-p, --progress', 'progress', false)
    .option('-m, --model <name>', 'model name', 'llama3.1')
    .option('-v, --verbose', 'verbose', false)
    .option('-l, --log <path>', 'log pipe', false)
    .option('-s, --skip', 'skip existing files. only write new files.', false)
    .action(async (task, options) => {

        // const options = program.opts()

        // Set Model
        const ollama = createOllama({
            fetch: async (url, options) => {
                const body = JSON.parse(options.body)
                body.options['num_ctx'] = 32 * 1024
                options.body = JSON.stringify(body)
                const result = await fetch(url, options)
                return result
            },
        })
        const model = ollama(options.model)

        // Get files
        const files = await getFiles(options)

        // Create tasks (from files)
        const tasks = files.length ? files.map((file) => {
            return { file, prompt: task }
        }) : [{ prompt: task }]

        if (options.output) {
            if (!fs.existsSync(options.output)) {
                fs.mkdirSync(options.output, { recursive: true })
            }
        }

        if (!tasks.length) {
            console.log('No tasks found')
            process.exit(0)
        }

        const realBar = new cliProgress.MultiBar({
            hideCursor: true,
            format: ' {bar} | ETA: {eta_formatted} | {value}/{total} | {duration_formatted} | {task} | {filename} ',
            autopadding: true,
            stopOnComplete: true,
        }, cliProgress.Presets.shades_classic)

        const multibar = options.progress ? realBar : new FakeBar

        console.log(`Using model: ${options.model}`)
        console.log(`Work divided over ${tasks.length} tasks`)
        if (options.log) {
            console.log(`using log file: ${options.log}`)
        }

        const main = multibar.create(tasks.length, 0, {
            filename: 'All tasks',
            task: '\t',
        })

        // Log to file?
        if (options.log) {
            createDeepPath(options.log)
        }
        const logStream = options.log ? fs.createWriteStream(options.log) : { write: () => { } }

        const tasksFn = tasks.map((task, index) => async () => {
            logStream.write(`# Task ${index}\n`)

            await runTaskStreaming(task, {
                logStream,
                model,
                multibar,
                output: options.output,
            })
            logStream.write(`\n\n`)

            main.increment()
        })
        await runTasksInSeries(tasksFn)

        multibar.stop()
        console.log('All Done')
    })

async function runTasksInSeries(tasks = []) {
    for (const fn of tasks) {
        await fn()
    }
}

// replay command    
program.command('replay')
    .description('replay a log')
    .argument('<string>', 'log file')
    .action((str, options) => {
        console.log(str)
    })

program.parse(process.argv)
