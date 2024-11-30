import fs from 'node:fs'
import { streamText } from "ai"
import { MarkdownParser } from "./parser.js"
import _colors from "ansi-colors"
import { createOllama } from 'ollama-ai-provider'
import { openai } from '@ai-sdk/openai';

const model = openai('o1-mini')

function loadFileContent(file = '') {
    return {
        file,
        content: fs.readFileSync(file, 'utf8')
    }
}
export class Task {
    prompt = ''
    intend = ''
    files = []

    constructor(obj = {}) {
        Object.assign(this, obj)
    }
    get context() {
        return this.files
            .map(loadFileContent)
            .map(renderFile)
            .join('\n')
    }
}

function createPrompt(task = new Task) {
    const prompt = `
### Intend
${task.prompt}

> IMPORTANT: put filename above codeblock as a strong tag e.g. ***file.js***

${task.context}`
    return { prompt }
}

export function createDeepPath(toPath = '') {
    if (fs.existsSync(toPath)) return

    const path = toPath
        .split('/')
        .slice(0, -1)
        .join('/')
    if (path) {
        fs.mkdirSync(path, { recursive: true })
    }
}

export function createOllamaModel(options = {}) {
    // Set Model
    const ollama = createOllama({
        // Add custom fetch to allow larger context window
        fetch: async (url, options) => {
            const body = JSON.parse(options.body)
            body.options['num_ctx'] = 32 * 1024
            options.body = JSON.stringify(body)
            const result = await fetch(url, options)
            return result
        },
    })
    return ollama(options.model)
}

function renderFile({ file = '', content = '' }) {
    const extension = file.split('.').pop()

    return `***${file}***
\`\`\`${extension}
${content}
\`\`\``
}

const ollama = createOllama()
const OPTIONS = {
    logStream: { write: (str = '') => { } },
    model: ollama('llama3.1'),
    multibar: {},
    tick: (ctx, raw) => { },
    output: '',
    createWriteStream: fs.createWriteStream
}

export async function runTasksInSeries(tasks = []) {
    for (const fn of tasks) {
        await fn()
    }
}

/**
 * 
 * @param {*} task 
 * @param {*} options 
 * @returns 
 */
export async function runTaskStreaming(task = {}, options = OPTIONS) {
    const {
        logStream,
        tick,
        model,
        // output,
        createWriteStream
    } = { ...OPTIONS, ...options }

    // Context loader
    // const context = taskContextLoader(task)

    const { prompt } = createPrompt(task)

    logStream.write(`## Prompt\n${prompt}\n\n\n`)

    // TODO catch errors
    const { textStream } = streamText({
        model,
        prompt,
        maxRetries: 1
    })

    let writeStream = null
    const parser = new MarkdownParser()

    logStream.write(`## Response\n`)

    function handleLine(line = '') {
        const resp = parser.parseLine(line)

        tick(resp, line)

        const isFile = resp.type === 'boldItalic' && resp.content.includes('.')
        // console.log(resp)
        if (isFile) {
            const path = resp.content
            const toPath = `${path}`

            // Create Path
            createDeepPath(toPath)

            logStream.write(`<!-- Writing to: ${toPath} -->\n`)

            // Update writeStream
            writeStream = createWriteStream(toPath)
        }

        if (resp.type === 'codeBlockLine') {
            if (!writeStream) {
                logStream.write(`<!-- no writeStream => dropped code -->\n`)
            }
            writeStream?.write(`${resp.content}\n`)
        }

        if (resp.type === 'codeBlockEnd') {
            writeStream = null
        }

    }

    let buffer = ''
    for await (const textPart of textStream) {
        logStream.write(textPart)

        buffer += textPart

        let newlineIndex
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIndex)
            buffer = buffer.slice(newlineIndex + 1)

            handleLine(`${line}`)
        }
    }

    if (writeStream) {
        writeStream.end()
    }

    return {
        task,
    }
}

export function createChatHandler(stream) {
    return (ctx) => {
        if (ctx.type === 'paragraph') {
            stream.write(`\t${ctx.content}\n`)
            return
        }
        if (ctx.type === 'codeBlockLine') {
            stream.write(`.`)
            return
        }
        if (ctx.type === 'codeBlockEnd') {
            stream.write(`done\n`)
            return
        }
    
        const isFile = ctx.type === 'strong' && ctx.content.includes('.')
        if (isFile) {
            stream.write(ctx.content)
            return
        }
    
        if (ctx.content) {
            stream.write(`${ctx.content || ''}\n`)
        }
    }
}