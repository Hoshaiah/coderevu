"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { Markdown } from "@/components/markdown";

const CodeViewer = dynamic(
  () => import("@/components/code-viewer").then((m) => m.CodeViewer),
  {
    ssr: false,
    loading: () => (
      <div className="h-full grid place-items-center bg-[#1e1e1e] text-fg-3 text-[12px]">
        Loading…
      </div>
    ),
  },
);

export function ReferencePanel({
  referenceSolution,
  language,
  explanation,
  onCollapse,
}: {
  referenceSolution: string;
  language: string;
  explanation: string;
  onCollapse: () => void;
}) {
  const [explainOpen, setExplainOpen] = useState(true);
  const explainPanelRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    const p = explainPanelRef.current;
    if (!p) return;
    if (explainOpen && p.isCollapsed()) p.expand();
    else if (!explainOpen && !p.isCollapsed()) p.collapse();
  }, [explainOpen]);

  return (
    <aside className="flex flex-col border-r border-rule bg-surface min-h-0 min-w-0 flex-1">
      {/* header — matches the editor's top bar */}
      <div className="flex items-center justify-between border-b border-rule bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md bg-brand/15 text-brand border border-brand/30 text-[10.5px] font-semibold tracking-[0.1em] uppercase">
            <span className="size-1.5 rounded-full bg-brand" />
            Reference solution
          </span>
          <span className="hidden md:inline text-[11.5px] text-fg-3">
            Compare with your draft →
          </span>
        </div>
        <button
          onClick={onCollapse}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-rule bg-surface-3 text-fg-2 hover:text-fg hover:border-fg-3 transition text-[11.5px]"
          aria-label="Collapse reference solution"
          title="Back to context"
        >
          <CollapseIcon /> Collapse
        </button>
      </div>

      {/* vertically resizable: code viewer on top, explanation below */}
      <PanelGroup
        direction="vertical"
        autoSaveId="coderevu:reference-panel"
        className="flex-1 min-h-0"
      >
        <Panel defaultSize={62} minSize={25} className="min-h-0">
          <CodeViewer code={referenceSolution} language={language} height="100%" />
        </Panel>

        <PanelResizeHandle className="group relative h-px bg-rule data-[resize-handle-state=hover]:bg-brand data-[resize-handle-state=drag]:bg-brand transition-colors">
          <span className="absolute inset-x-0 -top-1.5 -bottom-1.5 cursor-row-resize" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex w-10 h-[3px] items-center justify-center rounded-full bg-rule opacity-0 group-hover:opacity-100 group-data-[resize-handle-state=drag]:opacity-100 group-hover:bg-brand group-data-[resize-handle-state=drag]:bg-brand transition-opacity" />
        </PanelResizeHandle>

        <Panel
          ref={explainPanelRef}
          defaultSize={38}
          minSize={10}
          collapsible
          collapsedSize={5}
          onCollapse={() => setExplainOpen(false)}
          onExpand={() => setExplainOpen(true)}
          className="min-h-0 flex flex-col overflow-hidden"
        >
          {/* sticky explanation header — always visible, doubles as collapse toggle */}
          <button
            type="button"
            onClick={() => setExplainOpen((v) => !v)}
            className="flex items-center justify-between border-t border-rule bg-surface-2 px-5 h-10 shrink-0 hover:bg-surface-3/50 transition text-left"
            aria-expanded={explainOpen}
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-3">
              Explanation
            </span>
            <span
              className={`text-fg-3 text-[13px] transition-transform duration-150 ${
                explainOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            >
              ▾
            </span>
          </button>

          {explainOpen && (
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 bg-surface">
              <Markdown>{explanation}</Markdown>
            </div>
          )}
        </Panel>
      </PanelGroup>
    </aside>
  );
}

function CollapseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}
