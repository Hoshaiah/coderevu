"use client";

import { useEffect, useState } from "react";

// Map common short aliases to the language names Shiki recognises.
const LANG_ALIAS: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
};

function normalizeLang(lang?: string): string {
  if (!lang) return "text";
  const lower = lang.toLowerCase();
  return LANG_ALIAS[lower] ?? lower;
}

// Module-level memoization so the same (lang, code) pair across multiple
// CodeBlock instances doesn't re-highlight redundantly.
const HTML_CACHE = new Map<string, string>();

export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const lang = normalizeLang(language);
  const cacheKey = `${lang}::${code}`;
  const initial = HTML_CACHE.get(cacheKey) ?? null;
  const [html, setHtml] = useState<string | null>(initial);

  useEffect(() => {
    if (HTML_CACHE.has(cacheKey)) {
      setHtml(HTML_CACHE.get(cacheKey)!);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        // dark-plus mirrors VS Code's default dark theme — closest match
        // to Monaco's "vs-dark" used elsewhere in the app.
        const out = await codeToHtml(code, { lang, theme: "dark-plus" });
        if (cancelled) return;
        HTML_CACHE.set(cacheKey, out);
        setHtml(out);
      } catch {
        // unsupported language or shiki failure — fall through to plain code
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, code, lang]);

  if (html) {
    return (
      <div
        className="my-3 overflow-hidden rounded-md text-xs leading-relaxed border border-rule [&_pre]:!bg-[#1e1e1e] [&_pre]:!p-4 [&_pre]:overflow-x-auto [&_pre]:m-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre className="my-3 overflow-x-auto rounded-md bg-[#1e1e1e] text-zinc-100 p-4 text-xs leading-relaxed border border-rule">
      <code className={language ? `language-${language}` : ""}>{code}</code>
    </pre>
  );
}
