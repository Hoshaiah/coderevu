"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { StatusControl } from "@/components/status-control";
import { revealSolution } from "@/app/actions/progress";
import type { ProgressState } from "@/components/problem-workspace";

const CodeViewer = dynamic(
  () => import("@/components/code-viewer").then((m) => m.CodeViewer),
  {
    ssr: false,
    loading: () => (
      <div className="bg-[#1e1e1e] text-fg-3 text-[12px] px-4 py-8 text-center">
        Loading…
      </div>
    ),
  },
);

export function ProblemPanel({
  problemId,
  title,
  difficulty,
  tags,
  context,
  referenceSolution,
  language,
  explanation,
  revealed,
  onReveal,
  onExpandReference,
  status,
  onSetStatus,
  statusPending,
}: {
  problemId: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  context: string;
  referenceSolution: string;
  language: string;
  explanation: string;
  revealed: boolean;
  onReveal: () => void;
  onExpandReference: () => void;
  status: ProgressState;
  onSetStatus: (s: ProgressState) => void;
  statusPending: boolean;
}) {
  const [revealing, setRevealing] = useState(false);

  async function handleReveal() {
    setRevealing(true);
    try {
      await revealSolution(problemId);
      onReveal();
    } finally {
      setRevealing(false);
    }
  }

  const diffClass =
    difficulty === "easy"
      ? "pill-easy"
      : difficulty === "medium"
      ? "pill-medium"
      : "pill-hard";
  const diffLabel =
    difficulty === "easy" ? "Easy" : difficulty === "medium" ? "Medium" : "Hard";

  return (
    <div className="flex flex-col">
      {/* title block */}
      <div className="px-6 pt-6 pb-5 border-b border-rule">
        <h1 className="text-[22px] font-semibold tracking-tight text-fg leading-tight">
          {title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center h-[22px] px-2 rounded-md ${diffClass} text-[11.5px] font-medium`}
          >
            {diffLabel}
          </span>
          {tags.length > 0 && (
            <span data-tag-row="" className="contents">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex h-[22px] items-center px-2 rounded-md border border-rule bg-surface-2 text-[11.5px] font-mono text-fg-2"
                >
                  {t}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="mt-4">
          <StatusControl
            status={status}
            onSetStatus={onSetStatus}
            pending={statusPending}
          />
        </div>
      </div>

      <div className="px-6 py-5 overflow-y-auto space-y-6">
        {/* context */}
        <section>
          <SectionLabel>Context</SectionLabel>
          <Markdown>{context}</Markdown>
        </section>

        {/* reveal gate */}
        {!revealed ? (
          <section>
            <SectionLabel>Reference solution</SectionLabel>
            <div className="rounded-lg border border-dashed border-rule bg-surface-2 p-5">
              <p className="text-[13px] text-fg-2 leading-[1.6]">
                Try the fix yourself first. When you&rsquo;re stuck, reveal the
                reference solution and a walkthrough.
              </p>
              <Button
                variant="outline"
                onClick={handleReveal}
                disabled={revealing}
                className="mt-3 h-9 rounded-md border-rule bg-surface-3 text-fg hover:bg-surface-3/70"
              >
                {revealing ? "Revealing…" : "Reveal solution"}
              </Button>
            </div>
          </section>
        ) : (
          <>
            <Collapsible
              label="Reference solution"
              tone="brand"
              defaultOpen={false}
              action={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onExpandReference();
                  }}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-rule bg-surface-3 text-[11px] text-fg-2 hover:text-fg hover:border-brand/60 transition"
                  title="Expand to editor size for side-by-side comparison"
                >
                  <ExpandIcon /> Expand
                </button>
              }
            >
              <div className="rounded-lg border border-rule overflow-hidden">
                <CodeViewer code={referenceSolution} language={language} />
              </div>
            </Collapsible>
            <Collapsible label="Explanation" defaultOpen={false}>
              <div className="pt-1">
                <Markdown>{explanation}</Markdown>
              </div>
            </Collapsible>
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "hard" | "brand" | "default";
}) {
  const color =
    tone === "hard" ? "text-hard" : tone === "brand" ? "text-brand" : "text-fg-3";
  return (
    <h3
      className={`text-[11px] font-medium uppercase tracking-[0.14em] ${color} mb-2`}
    >
      {children}
    </h3>
  );
}

function Collapsible({
  label,
  tone,
  defaultOpen = false,
  action,
  children,
}: {
  label: string;
  tone?: "hard" | "brand" | "default";
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-rule bg-surface-2">
      <summary className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span
          className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
            tone === "hard"
              ? "text-hard"
              : tone === "brand"
              ? "text-brand"
              : "text-fg-2"
          }`}
        >
          {label}
        </span>
        <span className="flex items-center gap-2">
          {action}
          <span className="text-fg-3 group-open:rotate-180 transition-transform duration-150 text-[13px]">
            ▾
          </span>
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function ExpandIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}
