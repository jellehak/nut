#! /usr/bin/env node
import fs from 'node:fs';
import { generateText, streamText, tool } from "ai"
import { createOllama } from 'ollama-ai-provider';
import { glob } from 'glob';
import { Command } from 'commander';
import cliProgress from 'cli-progress';

// Initialize commander
const program = new Command();
program
    .option('-o, --output <folder>', 'output folder', '')
    .option('-i, --input <pattern>', 'input file glob pattern', '**/*.jsx')
    .option('-d, --dryrun', 'dryrun', false)
    .option('-m, --model <name>', 'model name', 'codegemma:7b')
    .option('-v, --verbose', 'verbose', false)
    .parse(process.argv);

const options = program.opts();

// Set Model
const ollama = createOllama({
    // optional settings, e.g.
    // baseURL: 'https://api.ollama.com',
});
// const model = ollama('llama3.1');
const model = ollama(options.model);
// : groq('llama-3.1-70b-versatile')

const task = process.argv[2];
// console.log(options)
const files = await glob(options.input, { ignore: 'node_modules/**' })

const tasks = files.map((file) => {
    return { file, prompt: task }
})

// Create the output folder if it doesn't exist
if(!options.dryrun) {
    if (!fs.existsSync(options.output)){
        fs.mkdirSync(options.output, { recursive: true });
    }
}

if(options.dryrun && options.verbose) {
    console.log('Dryrun enabled')
    console.log({
        task,
        options,
        tasks,
        glob: options.input,
        files
    })
}

if(!tasks.length) {
    console.log('No files found')
    process.exit(0)
}

async function runTasksInSeries(tasks) {
    for (const task of tasks) {
        await runTask(task);
    }
}

// run each task
const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: ' {bar} | {filename} > {output} | {value}/{total}',
}, cliProgress.Presets.shades_grey);

await runTasksInSeries(tasks);

// const promises = tasks.map(async task => {
//     await runTask(task)
// })
// await Promise.all(promises)

multibar.stop();
console.log('Done')

function createPrompt(task = {}, data = '') {
    const prompt = `
    Only respond with the file contents.
    Add the filename in the response. Like ***file.ext***
    Task:
    ${task.prompt}
    ***${task.file}***
    \`\`\`
    ${data}
    \`\`\`
    `
    return {prompt}
}

/**
 * 
 * @param {*} task 
 */
async function runTask(task = {}) {
    const data = fs.readFileSync(task.file, 'utf8');

    const {prompt} = createPrompt(task, data)

    const { textStream } = streamText({
        model,
        prompt,
    });

    // guess amount of chunks
    const chunks = Math.ceil(data.length / 3)
    const b1 = multibar.create(chunks, 0,{ 
        filename: task.file,
        output: `${options.output}...`
    });

    let final = ''
    for await (const textPart of textStream) {
        // Show nice progress indicator
        b1.increment();
        // process.stdout.write(textPart);
        final += textPart
    }

    // Extract filename
    const tofile = final.match(/\*\*\*(.*?)\*\*\*/)[1]
    const toPath = `${options.output}${tofile}`
    // Get content between ```
    const raw = final.match(/```([\s\S]*?)```/)[1]

    // console.log({tofile})
    b1.increment({ output: toPath });

    // Write to disk
    if(!options.dryrun) {
        fs.writeFileSync(toPath, raw)
    }

    // b1.stop();

    return {
        task,
        final,
        tofile,
        raw
    }
}

