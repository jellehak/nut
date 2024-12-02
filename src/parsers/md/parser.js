export class MarkdownParser {
    constructor() {
        this.isCodeBlock = false; // Tracks if we are inside a code block
        this.currentCodeBlock = null; // Tracks the current code block node
    }

    /**
     * Checks if a line matches a specific pattern (e.g., a file tag).
     * @param {string} line - The line to check.
     * @param {string} tag - The tag to match (e.g., "file").
     * @returns {boolean} - True if the line matches the tag pattern.
     */
    isFileTag(line, tag) {
        const pattern = new RegExp(`^\\[${tag}\\]:\\s*(.+)$`);
        return pattern.test(line);
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

        // Todo list item
        const todoMatch = line.match(/^- \[([ xX])\] (.+)$/);
        if (todoMatch) {
            const isChecked = todoMatch[1].toLowerCase() === "x";
            const content = this.processInlineElements(todoMatch[2].trim());
            return { type: "todoItem", isChecked, content };
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

        // Handle file tag
        if (this.isFileTag(line, "file")) {
            const filePath = line.match(/^\[file\]:\s*(.+)$/)[1];
            return { type: "fileTag", path: filePath.trim() };
        }

        // All bold and italic
        const boldItalicMatch = line.trim().match(/^\*\*\*(.+?)\*\*\*$/);
        if (boldItalicMatch) {
            const content = boldItalicMatch[1];
            return { type: "boldItalic", content };
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

            // Handle list items
            if (result.type === "listItem" || result.type === "todoItem") {
                if (!currentList) {
                    currentList = { type: "list", items: [] };
                    ast.push(currentList);
                }
                currentList.items.push(result);
                continue;
            }

            if (result.type === "codeBlockStart") {
                ast.push(result.node);
                continue;
            }

            if (currentList) {
                currentList = null; // End the list context
            }

            if (result.type === "fileTag") {
                ast.push(result);
                continue;
            }

            if (result.node) {
                ast.push(result.node);
            }
        }

        return ast;
    }
}
