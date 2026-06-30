import { createCodeBlockSpec } from "@blocknote/core/blocks";
import { getSingletonHighlighter } from "shiki";

// Real Shiki grammar ids to preload. "text" is intentionally excluded — it's a
// no-grammar placeholder (plain), handled by BlockNote without a Shiki grammar.
const LANGS = [
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "json",
  "php",
  "python",
  "bash",
  "html",
  "css",
  "scss",
  "sql",
  "yaml",
  "markdown",
  "go",
  "java",
  "ruby",
  "rust",
];

/**
 * Code block with Shiki syntax highlighting (DOCSTUDIO code-block enhancement).
 * Shared by the web editor and the client renderer. The highlighter is created
 * lazily (client-side) the first time a code block needs highlighting.
 */
export const codeBlockSpec = createCodeBlockSpec({
  defaultLanguage: "text",
  indentLineWithTab: true,
  supportedLanguages: {
    text: { name: "Text", aliases: ["plaintext", "txt"] },
    javascript: { name: "JavaScript", aliases: ["js"] },
    typescript: { name: "TypeScript", aliases: ["ts"] },
    jsx: { name: "JSX" },
    tsx: { name: "TSX" },
    json: { name: "JSON" },
    php: { name: "PHP" },
    python: { name: "Python", aliases: ["py"] },
    bash: { name: "Bash", aliases: ["sh", "shell"] },
    html: { name: "HTML" },
    css: { name: "CSS" },
    scss: { name: "SCSS" },
    sql: { name: "SQL" },
    yaml: { name: "YAML", aliases: ["yml"] },
    markdown: { name: "Markdown", aliases: ["md"] },
    go: { name: "Go" },
    java: { name: "Java" },
    ruby: { name: "Ruby", aliases: ["rb"] },
    rust: { name: "Rust", aliases: ["rs"] },
  },
  // The code block container is always dark in our design (#1e293b), so a single
  // dark theme is used regardless of the app's light/dark mode.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createHighlighter: () =>
    getSingletonHighlighter({ themes: ["github-dark"], langs: LANGS }) as any,
});
