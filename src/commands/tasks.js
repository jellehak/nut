import fs from 'node:fs'
import { glob } from 'glob'
import { createDeepPath, runTaskStreaming, Task, createOllamaModel, runTasksInSeries, createChatHandler } from '../lib.js'

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

export async function doTask(task = "", options = {}) {
    const model = createOllamaModel(options)

    const files = await getFiles(options)
    const systemPrompt = options.system ? loadSystemPrompt(options.system) : undefined
    
    const tasks = files.length ?
        files.map((file) => (new Task({ files:[file], prompt: task, systemPrompt }))) :
        [new Task({ prompt: task, systemPrompt })]

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
            process.stdout.write(`${ctx.type}\t${ctx.content || ''}`)
            return
        }

        chatConsoleLogging(ctx)
    }

    const tasksFn = tasks.map((task, index) => async () => {
        console.log(`Processing task ${index + 1}/${tasks.length}`)
        
        if(options.debug) {
            console.log(task)
        }

        logStream.write(`# Task ${index}\n`)

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

