import {MarkdownParser} from "../../parser.js"
import {readFileSync} from 'node:fs'

const data = readFileSync("log.md", "utf8")

async function* splitByNewline(data) {
    const lines = data.split('\n')
    for (const line of lines) {
        yield line
    }
}

const lineStream = splitByNewline(data)

const parser = new MarkdownParser()

for await (const line of lineStream) {
    const resp = parser.parseLine(line)

    // debug
    console.log(`${resp.type}\t${resp.content || resp.node?.text || ''}`)
}

