import fs from 'node:fs'
import { streamText } from "ai"
import { MarkdownParser } from "./parsers/md/parser.js"
import { createOllama } from 'ollama-ai-provider'
import { openai } from '@ai-sdk/openai';

const ollama = createOllama()

export class Task {
    prompt = ''
    files = []
    systemPrompt = ''

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
    return prompt
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

export class TaskOptions {
    logStream = { write: (str = '') => { } }
    model = ollama('llama3.1')
    multibar = {}
    tick = function (ctx, raw) { }
    output = ''
    parser = new MarkdownParser()
    createWriteStream = fs.createWriteStream

    constructor(obj = {}) {
        Object.assign(this, obj)
    }
}

/**
 * 
 * @param {*} task 
 * @param {*} options 
 * @returns 
 */
export async function runTaskStreaming(task = new Task, options = new TaskOptions) {
    const {
        logStream,
        tick,
        model,
        parser,
        createWriteStream
    } = { ...new TaskOptions, ...options }

    // const prompt = task.prompt
    const prompt = createPrompt(task)

    logStream.write(`## Prompt\n${prompt}\n\n\n`)

    const config = {
        model,
        system: task.systemPrompt,
        prompt,
        maxRetries: 1
    }
    const { textStream } = streamText(config)

    let writeStream = null

    logStream.write(`## Response\n`)

    const _parser = new MarkdownLineParser(options)

    let buffer = ''
    let result = '';
    for await (const textPart of textStream) {
        logStream.write(textPart)

        buffer += textPart

        // result += parser.parse('message_1', buffer)
        // process.stdout.write(textPart)

        buffer = _parser.parse(buffer)
    }

    if (writeStream) {
        writeStream.end()
    }

    return {
        task,
    }
}

class MarkdownLineParser {
    logStream
    writeStream
    createWriteStream
    parser = new MarkdownParser()
    tick

    constructor(options) {
        Object.assign(this, options)
    }

    handleLine(line) {
        const { logStream, writeStream } = this
        // MD Parser
        const resp = this.parser.parseLine(line)

        this.tick(resp, line)

        if (isFile(resp)) {
            const path = resp.content
            const toPath = `${path}`

            // Create Path
            createDeepPath(toPath)

            logStream.write(`<!-- Writing to: ${toPath} -->\n`)

            // Update writeStream
            this.writeStream = this.createWriteStream(toPath)
        }

        if (resp.type === 'codeBlockLine') {
            if (!writeStream) {
                logStream.write(`<!-- no writeStream => dropped code -->\n`)
            }
            writeStream?.write(`${resp.content}\n`)
        }

        if (resp.type === 'codeBlockEnd') {
            this.writeStream = null
        }
    }

    parse(buffer) {
        //  line parser
        let newlineIndex
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIndex)
            buffer = buffer.slice(newlineIndex + 1)

            this.handleLine(`${line}`)
        }
        return buffer
    }
}

function loadFileContent(file = '') {
    return {
        file,
        content: fs.readFileSync(file, 'utf8')
    }
}

const isFile = ctx => ['strong','boldItalic'].includes(ctx.type) && ctx.content.includes('.')

export function createChatHandler(stream) {
    return (ctx) => {
        if (ctx.type === 'paragraph') {
            stream.write(`${ctx.content}\n`)
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
    
        if (isFile(ctx)) {
            stream.write(ctx.content)
            return
        }
    
        if (ctx.content) {
            stream.write(`${ctx.content || ''}\n`)
        }
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
    return ollama(options.model || 'llama3.1')
}

function renderFile({ file = '', content = '' }) {
    const extension = file.split('.').pop()

    return `***${file}***
\`\`\`${extension}
${content}
\`\`\``
}


export async function runTasksInSeries(tasks = []) {
    for (const fn of tasks) {
        await fn()
    }
}