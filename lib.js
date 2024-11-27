import fs from 'node:fs'
import { generateText, streamText, tool } from "ai"
import { createOllama } from 'ollama-ai-provider'
import { glob } from 'glob'
import { Command } from 'commander'
import cliProgress from 'cli-progress'
import { MarkdownParser } from "./parser.js"
import _colors from "ansi-colors"

function createPrompt(task = {}, data = '') {
    const extension = task.file.split('.').pop()
    const prompt = `
## Task
${task.prompt}

***${task.file}***
\`\`\`${extension}
${data}
\`\`\`
    `
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

const OPTIONS = {
    logStream: { write: (str = '') => { } },
    /** @type LanguageModelV1 */
    model: null,
    multibar: {},
}
export async function runTaskStreaming(task = {}, options = OPTIONS) {
    const { 
        logStream,
        model,
        multibar,
        output
     } = { ...OPTIONS, ...options}
// console.log(options)

    const data = fs.readFileSync(task.file, 'utf8')

    const { prompt } = createPrompt(task, data)

    logStream.write(`## Prompt\n${prompt}\n\n\n`)

    const { textStream } = streamText({
        model,
        prompt,
    })

    const guessedTotalChunks = Math.ceil(data.length / 3)

    let writeStream = null
    const parser = new MarkdownParser()

    const inputTaskBar = multibar.create(guessedTotalChunks, 0, {
        filename: task.file,
        task: 'scanning',
    })

    logStream.write(`## Response\n`)

    function handleLine(line = '') {
        const resp = parser.parseLine(line)

        const isFile = resp.type === 'strong' && resp.node?.text.includes('.')
        if (isFile) {
            const path = resp.node?.text
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
            writeStream?.write(resp.content)
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

            handleLine(`${line}\n`)
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
