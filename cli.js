#! /usr/bin/env node
import fs from 'node:fs'
import { generateText, streamText, tool } from "ai"
import { createOllama } from 'ollama-ai-provider'
import { glob } from 'glob'
import { Command } from 'commander'
import cliProgress from 'cli-progress'
import { MarkdownParser } from "./parser.js"

// Initialize commander
const program = new Command()
program
    .argument('<string>', 'prompt')
    .option('-o, --output <folder>', 'output folder', '')
    .option('-i, --input <pattern>', 'input file glob pattern', '**/*.jsx')
    .option('-p, --progress', 'progress', false)
    .option('-m, --model <name>', 'model name', 'codegemma:7b')
    .option('-v, --verbose', 'verbose', false)
    .option('-l, --log <path>', 'log pipe', false)
    .option('-s, --skip', 'skip existing files. only write new files.', false)
    .parse(process.argv)

const options = program.opts()

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

const task = process.argv[2]

const files = await glob(options.input, { ignore: 'node_modules/**' })

const tasks = files.map((file) => {
    return { file, prompt: task }
})

if (options.output) {
    if (!fs.existsSync(options.output)) {
        fs.mkdirSync(options.output, { recursive: true })
    }
}

if (options.verbose) {
    console.log({
        task,
        options,
        tasks,
        glob: options.input,
        files
    })
}

if (!tasks.length) {
    console.log('No files found')
    process.exit(0)
}

async function runTasksInSeries(tasks = []) {
    for (const fn of tasks) {
        await fn()
    }
}

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

const realBar = new cliProgress.MultiBar({
    autopadding: true,
    format: ' {bar} | ETA: {eta_formatted}\t | {value}/{total}\t | {duration_formatted} | {task}\t | {filename}\t ',
}, cliProgress.Presets.shades_classic)

const multibar = options.progress ? realBar : new FakeBar

console.log(`Using model: ${options.model}`)
console.log(`Work divided over ${tasks.length} tasks`)

const main = multibar.create(tasks.length, 0, {
    filename: 'All tasks',
    task: '\t',
})

const logStream = options.log ? fs.createWriteStream(options.log) : { write: () => { } }

const tasksFn = tasks.map(task => async () => {
    await runTaskStreaming(task, { logStream })
    main.increment()
})
await runTasksInSeries(tasksFn)

multibar.stop()
console.log('All Done')

function createPrompt(task = {}, data = '') {
    const prompt = `
## Task
${task.prompt}

***${task.file}***
\`\`\`
${data}
\`\`\`
    `
    return { prompt }
}

async function runTaskStreaming(task = {}, { logStream = { write: (str = '') => { } } }) {
    const data = fs.readFileSync(task.file, 'utf8')

    const { prompt } = createPrompt(task, data)

    logStream.write(`# Prompt\n${prompt}\n\n\n`)

    const { textStream } = streamText({
        model,
        prompt,
    })

    const guessedTotalChunks = Math.ceil(data.length / 3)

    let writeStream
    const parser = new MarkdownParser()

    const inputTaskBar = multibar.create(guessedTotalChunks, 0, {
        filename: task.file,
        task: 'scanning',
    })

    logStream.write(`# Response\n`)

    let buffer = ''

    function handleLine(line = '') {
        const resp = parser.parseLine(line)

        if (resp.type === 'strong') {
            const path = resp.node?.text
            const toPath = `${options.output}${path}`

            if (options.output) {
                if (!fs.existsSync(toPath)) {
                    const path = toPath
                        .split('/')
                        .slice(0, -1)
                        .join('/')
                    if (path) {
                        fs.mkdirSync(path, { recursive: true })
                    }
                }
            }

            logStream.write(`<!-- Writing to: ${toPath} -->\n`)

            writeStream = options.output ? fs.createWriteStream(toPath) : process.stdout
        }

        if (resp.type === 'codeBlockLine') {
            writeStream?.write(resp.content)
        }

        inputTaskBar.increment()
    }

    for await (const textPart of textStream) {
        logStream.write(textPart)

        buffer += textPart

        let newlineIndex
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIndex)
            buffer = buffer.slice(newlineIndex + 1)

            handleLine(line)
        }
    }

    inputTaskBar.update(guessedTotalChunks)
    inputTaskBar.stop()

    if (writeStream) {
        writeStream.end()
    }

    return {
        task,
    }
}
