"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";

type MonacoInstance = Parameters<OnMount>[0];

// Read-only Monaco instance. Used for the reference solution so it renders
// with the exact same tokenizer + theme + background as the main editor,
// guaranteeing visual parity.
export function CodeViewer({
  code,
  language,
  height,
  showLineNumbers = true,
}: {
  code: string;
  language: string;
  height?: number | string;
  showLineNumbers?: boolean;
}) {
  // When caller pins the height (e.g. "100%"), respect it and skip autosize.
  const fixed = height !== undefined;

  // Start with a line-count estimate so SSR / first paint has a reasonable
  // height, then let Monaco report the real wrapped content height.
  const lineCount = Math.max(code.split("\n").length, 4);
  const initialHeight = Math.min(lineCount * 19 + 24, 720);
  const [autoHeight, setAutoHeight] = useState(initialHeight);
  const editorRef = useRef<MonacoInstance | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Monaco's built-in automaticLayout sometimes misses panel resizes inside
  // react-resizable-panels. Observe the host ourselves and force a relayout,
  // which re-flows wordWrap at the new width.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const ed = editorRef.current;
      if (!ed) return;
      ed.layout({ width: host.clientWidth, height: host.clientHeight });
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    const host = hostRef.current;
    if (host) {
      editor.layout({ width: host.clientWidth, height: host.clientHeight });
    }
    if (!fixed) {
      const sync = () => setAutoHeight(editor.getContentHeight());
      sync();
      editor.onDidContentSizeChange(sync);
    }
  };

  const containerHeight = fixed ? height : autoHeight;

  return (
    <div
      ref={hostRef}
      className="w-full min-w-0"
      style={{ height: containerHeight, minHeight: 96 }}
    >
      <Editor
        value={code}
        language={language}
        theme="vs-dark"
        onMount={handleMount}
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          wrappingIndent: "indent",
          lineNumbers: showLineNumbers ? "on" : "off",
          renderLineHighlight: "none",
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            alwaysConsumeMouseWheel: false,
          },
          overviewRulerLanes: 0,
          folding: false,
          glyphMargin: false,
          lineDecorationsWidth: 10,
          lineNumbersMinChars: showLineNumbers ? 3 : 0,
        }}
      />
    </div>
  );
}
