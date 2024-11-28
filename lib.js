import fs from 'node:fs'
import { streamText } from "ai"
import { MarkdownParser } from "./parser.js"
import _colors from "ansi-colors"

function createPrompt(task = {}, context = {}) {
    const _context = context.files.map(renderFile).join('\n')

    const prompt = `
### Intend
${task.prompt}

> IMPORTANT: put filename above codeblock as a strong tag e.g. ***file.js***

${_context}`
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

function renderFile({file = '', content = ''}) {
    const extension = file.split('.').pop()

    return `***${file}***
\`\`\`${extension}
${content}
\`\`\``
}

function taskContextLoader(task = {}) {
    if(task.file) {
        return {
            files: [
                {
                    file: task.file,
                    content: fs.readFileSync(task.file, 'utf8')
                }
            ]
        }
    }
    return {
        files: []
    }
}

function guessTotalChunks(task = {}, context = {}) {
    if(context.files.length) {
        return Math.ceil(context.files[0].content / 3)
    }
    return 1
}

const OPTIONS = {
    logStream: { write: (str = '') => { } },
    model: null,
    multibar: {},
    output: '',
}

export async function runTaskStreaming(task = {}, options = OPTIONS) {
    const {
        logStream,
        tick,
        model,
        multibar,
        output
    } = { ...OPTIONS, ...options }

    // Context loader
    const context = taskContextLoader(task)

    const { prompt } = createPrompt(task, context)

    logStream.write(`## Prompt\n${prompt}\n\n\n`)

    const { textStream } = streamText({
        model,
        prompt,
    })

    // Detect total chunks
    const guessedTotalChunks = guessTotalChunks(task, context)

    let writeStream = null
    const parser = new MarkdownParser()

    const inputTaskBar = multibar.create(guessedTotalChunks, 0, {
        filename: task.file,
        task: 'scanning',
    })

    logStream.write(`## Response\n`)

    function handleLine(line = '') {
        const resp = parser.parseLine(line)

        tick(resp, line)

        const isFile = resp.type === 'strong' && resp.content.includes('.')
        if (isFile) {
            const path = resp.content
            const toPath = `${output}${path}`

            // Create Path
            if (output) {
                createDeepPath(toPath)
            }

            logStream.write(`<!-- Writing to: ${toPath} -->\n`)

            inputTaskBar.update({ filename: toPath, task: 'writing' })
            // Update writeStream
            writeStream = output ? fs.createWriteStream(toPath) : process.stdout
        }

        if (resp.type === 'codeBlockLine') {
            if (!writeStream) {
                logStream.write(`<!-- dropped code -->\n`)
            }
            writeStream?.write(`${resp.content}\n`)
        }

        if (resp.type === 'codeBlockEnd') {
            writeStream = null
        }

        inputTaskBar.increment()
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

    inputTaskBar.update(guessedTotalChunks)
    inputTaskBar.stop()

    if (writeStream) {
        writeStream.end()
    }

    return {
        task,
    }
}
