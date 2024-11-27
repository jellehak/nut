import {MarkdownParser} from "../../parser.js"
import {readFileSync} from 'node:fs'

const data = readFileSync("response.md", "utf8")

async function* splitByNewline(data) {
    const lines = data.split('\n')
    for (const line of lines) {
        yield line
    }
}

const lineStream = splitByNewline(data)

const StdOutFileWriter = (path = '') => {
    return {
        write(content) { 
            process.stdout.write(`${path}\t >> ${content}\n`)
        }
    }
}

const options = {
    createWriteStream: StdOutFileWriter
    // createWriteStream: fs.createWriteStream
}

let writeStream = null

const parser = new MarkdownParser();

for await (const line of lineStream) {
    const resp = parser.parseLine(line)
   
    if(resp.type === 'strong') {
        const path = resp.node?.text
        writeStream = options.createWriteStream(path)
    }

    if(resp.type === 'codeBlockLine') {
        writeStream?.write(resp.content)
    }
    
    // debug
    // console.log(`${resp.type}\t${resp.content || resp.node?.text || ''}`)
}

