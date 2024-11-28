export class MarkdownParser {
    constructor() {
        this.isCodeBlock = false; // Tracks if we are inside a code block
        this.currentCodeBlock = null; // Tracks the current code block node
    }

    parseLine(line = '') {
        // Handle code block ending
        if (this.isCodeBlock) {
            if (line.startsWith("```")) {
                this.isCodeBlock = false;
                const codeBlock = this.currentCodeBlock;
                this.currentCodeBlock = null;
                return { type: "codeBlockEnd", node: codeBlock };
            } else {
                this.currentCodeBlock.content += line + "\n";
                return { type: "codeBlockLine", content: line };
            }
        }

        // Handle code block starting
        if (line.startsWith("```")) {
            const language = line.slice(3).trim() || null;
            const codeBlock = { type: "codeBlock", language, content: "" };
            this.currentCodeBlock = codeBlock;
            this.isCodeBlock = true;
            return { type: "codeBlockStart", language, node: codeBlock };
        }

        // Heading
        if (line.startsWith("#")) {
            const level = line.match(/^#+/)[0].length; // Count '#' for level
            const content = line.slice(level).trim();
            return { type: "heading", level, content };
        }

        // Unordered list item
        if (line.startsWith("- ")) {
            const content = this.processInlineElements(line.slice(2).trim());
            return { type: "listItem", content };
        }

        // Blank line
        if (line.trim() === "") {
            return { type: "blankLine" };
        }

        // All bold and italic
        const boldItalicMatch = line.trim().match(/^\*\*\*(.+?)\*\*\*$/);
        if (boldItalicMatch) {
            const content = boldItalicMatch[1];
            return { type: "strong", content };
        }

        // Strong element on a single line
        const strongMatch = line.trim().match(/^\*\*(.+?)\*\*$/);
        if (strongMatch) {
            const content = strongMatch[1];
            return { type: "strong", content };
        }

        // Paragraph
        const content = this.processInlineElements(line.trim());
        return { type: "paragraph", content };
    }

    processInlineElements(text) {
        // Replace strong elements (**text**)
        return text.replace(/\*\*(.+?)\*\*/g, (_, content) => {
            return JSON.stringify({ type: "strong", content });
        });
    }

    parse(markdown = "") {
        const lines = markdown.split("\n");
        const ast = [];
        let currentList = null;

        for (const line of lines) {
            const result = this.parseLine(line);

            // Process returned information
            if (result.type === "listItem") {
                if (!currentList) {
                    currentList = { type: "list", items: [] };
                    ast.push(currentList);
                }
                currentList.items.push(result.node);
                continue;
            }

            if (result.type === "codeBlockStart") {
                ast.push(result.node);
                continue;
            }

            if (result.type === "codeBlockEnd") {
                // Code block was already pushed; nothing more to do
                continue;
            }

            if (result.type === "codeBlockLine") {
                // Code block content is handled inline; no AST change
                continue;
            }

            if (result.type === "blankLine") {
                // Do nothing for blank lines
                continue;
            }

            if (currentList) {
                currentList = null; // End the list context
            }

            if (result.node) {
                ast.push(result.node);
            }
        }

        return ast;
    }
}

// // Example usage
// const markdown = `
// # Heading 1
// This is a **paragraph**.

// - **Item 1**
// - Item 2
// - Item **3**

// ## Heading 2
// Another **paragraph**.

// \`\`\`js
// console.log("Hello, World!");
// const x = 42;
// \`\`\`
// `;

// const parser = new MarkdownParser();
// const ast = parser.parse(markdown);
// console.log(JSON.stringify(ast, null, 2));
