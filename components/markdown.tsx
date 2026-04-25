import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/code-block";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-semibold tracking-tight mt-5 mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold tracking-tight mt-5 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[13.5px] font-semibold tracking-wide uppercase text-brand mt-6 mb-3 first:mt-0">
      {children}
    </h3>
  ),
  hr: () => <hr className="my-6 border-0 border-t border-rule" />,
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-foreground/90 my-3">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 my-3 space-y-1 text-sm text-foreground/90">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 my-3 space-y-1 text-sm text-foreground/90">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} className="underline underline-offset-2 hover:text-foreground">
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      const lang = (className?.match(/language-([\w-]+)/) ?? [])[1];
      const text = String(children ?? "").replace(/\n$/, "");
      return <CodeBlock code={text} language={lang} />;
    }
    // Inline code — styled to match the vs-dark Monaco theme so prose
    // samples read like the editor above. Token-type inferred from shape.
    const raw = String(children ?? "");
    const color = inlineCodeColor(raw);
    return (
      <code
        className="rounded bg-[#1e1e1e] border border-rule px-1.5 py-0.5 font-mono text-[0.85em]"
        style={{ color }}
      >
        {children}
      </code>
    );
  },
  // CodeBlock already renders its own <pre>; passthrough so we don't double-wrap.
  pre: ({ children }) => <>{children}</>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 pl-4 text-muted-foreground italic my-3">
      {children}
    </blockquote>
  ),
};

// Pick a Monaco vs-dark-ish color based on a rough inline token shape so
// snippets like `SELECT`, `:customer`, `.includes()`, `"utf-8"` read like
// syntax-highlighted code rather than flat gray text.
const KEYWORDS = new Set([
  "select", "from", "where", "and", "or", "not", "in", "on", "join", "left",
  "right", "inner", "outer", "order", "by", "group", "limit", "offset",
  "insert", "into", "values", "update", "set", "delete", "case", "when",
  "then", "else", "end", "null", "is", "true", "false", "as",
  "def", "class", "if", "else", "elif", "for", "while", "return", "import",
  "from", "yield", "async", "await", "try", "except", "finally", "raise",
  "with", "lambda", "pass", "break", "continue", "global", "nonlocal",
  "function", "const", "let", "var", "new", "this", "super", "extends",
  "throw", "catch", "do", "switch", "default", "typeof", "instanceof",
  "public", "private", "protected", "static", "final", "abstract",
  "interface", "enum", "struct", "impl", "trait", "mut", "fn", "use", "mod",
  "pub", "match", "self", "nil", "module", "require", "include",
]);

function inlineCodeColor(token: string): string {
  const t = token.trim();
  if (!t) return "#d4d4d4";
  // strings
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return "#ce9178"; // Monaco string orange
  }
  // numbers
  if (/^-?\d[\d_.eE+-]*$/.test(t)) return "#b5cea8";
  // comments
  if (t.startsWith("//") || t.startsWith("#")) return "#6a9955";
  // symbols (ruby :foo, erlang atoms)
  if (/^:[a-zA-Z_]/.test(t)) return "#4ec9b0"; // teal
  // function/method calls:  foo(…), foo(), .includes(:x)
  if (/[A-Za-z_][\w?!]*\s*\(/.test(t)) return "#dcdcaa"; // yellow
  // keyword check (lowercased first word)
  const firstWord = (t.match(/[A-Za-z_][\w]*/) ?? [""])[0].toLowerCase();
  if (KEYWORDS.has(firstWord)) return "#c586c0"; // purple
  // looks like SQL-y all-caps
  if (/^[A-Z_]{2,}$/.test(t)) return "#c586c0";
  // TitleCase / PascalCase → types
  if (/^[A-Z][a-zA-Z0-9_]+$/.test(t)) return "#4ec9b0";
  // default identifier
  return "#9cdcfe";
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-foreground/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
