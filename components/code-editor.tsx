"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";

type MonacoInstance = Parameters<OnMount>[0];
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveDraft } from "@/app/actions/progress";
import { StatusControl } from "@/components/status-control";
import { CodeViewer } from "@/components/code-viewer";
import type { ProgressState } from "@/components/problem-workspace";

type Tab = "editor" | "original";

export function CodeEditor({
  problemId,
  initialCode,
  originalCode,
  language,
  onChange,
  status,
  onSetStatus,
  statusPending,
}: {
  problemId: string;
  initialCode: string;
  originalCode: string;
  language: string;
  onChange?: (value: string) => void;
  status: ProgressState;
  onSetStatus: (s: ProgressState) => void;
  statusPending: boolean;
}) {
  // Monaco is the source of truth for the live draft. We mirror it in a
  // ref for tab-switch and reset logic, and a state for UI bits that need
  // to re-render (modified indicator, reset-button enablement).
  //
  // Important: we DO NOT pass `value` to <Editor>. Using `defaultValue`
  // makes Monaco uncontrolled; React state updates per-keystroke don't
  // round-trip through the editor's model. This avoids the cursor-jump
  // bug that the controlled pattern causes when typing fast.
  const draftRef = useRef<string>(initialCode);
  const [draft, setDraft] = useState(initialCode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("editor");
  const [resetOpen, setResetOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<MonacoInstance | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);

  // Monaco's automaticLayout sometimes misses panel resizes inside
  // react-resizable-panels, so we observe the host ourselves and force a
  // relayout with explicit dimensions. Passing {width,height} (instead of
  // no-arg layout()) is what forces wordWrap to re-flow at the new width.
  useEffect(() => {
    const host = editorHostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const ed = editorRef.current;
      if (!ed) return;
      ed.layout({ width: host.clientWidth, height: host.clientHeight });
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    const host = editorHostRef.current;
    if (host) {
      editor.layout({ width: host.clientWidth, height: host.clientHeight });
    }
  };

  const modified = draft !== originalCode;

  const persist = useCallback(
    async (code: string) => {
      setSaving(true);
      try {
        await saveDraft(problemId, code);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch (err) {
        console.error(err);
        toast.error("Failed to save draft");
      } finally {
        setSaving(false);
      }
    },
    [problemId],
  );

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function handleChange(next: string | undefined) {
    const v = next ?? "";
    draftRef.current = v;
    setDraft(v);
    onChange?.(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void persist(v), 1200);
  }

  function requestReset() {
    if (draftRef.current === originalCode) return;
    setResetOpen(true);
  }

  function confirmReset() {
    setResetOpen(false);
    setTab("editor");
    // Imperatively reset the editor's content so the cursor and undo
    // stack get cleanly replaced.
    const ed = editorRef.current;
    if (ed) ed.setValue(originalCode);
    draftRef.current = originalCode;
    setDraft(originalCode);
    onChange?.(originalCode);
    void persist(originalCode);
    toast.success("Reverted to original buggy code");
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="bg-surface-2 border border-rule ring-1 ring-rule text-fg max-w-md">
          <DialogHeader className="pt-1">
            <DialogTitle className="text-fg text-[16px] font-semibold flex items-center gap-2">
              <span className="size-6 grid place-items-center rounded-md bg-hard/15 border border-hard/30 text-hard">
                <WarnIcon />
              </span>
              Reset your solution?
            </DialogTitle>
            <DialogDescription className="text-fg-2 leading-[1.6]">
              This replaces your current edits with the original buggy code.
              Your draft will be overwritten on the server and can&rsquo;t be
              recovered.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-transparent border-t-0 -mx-4 -mb-4 p-4 pt-2 sm:justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setResetOpen(false)}
              className="h-9 px-4 text-[13px] text-fg-2 hover:text-fg hover:bg-surface-3"
            >
              Keep editing
            </Button>
            <Button
              onClick={confirmReset}
              className="h-9 px-4 text-[13px] font-medium bg-hard/15 text-hard border border-hard/30 hover:bg-hard hover:text-white hover:border-hard"
            >
              Reset and lose edits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* tab bar */}
      <div className="flex items-center justify-between border-b border-rule bg-surface-2">
        <div className="flex items-stretch">
          <TabButton
            active={tab === "editor"}
            onClick={() => setTab("editor")}
            label="Your solution"
            sublabel={language}
            dot={modified ? "brand" : undefined}
          />
          <TabButton
            active={tab === "original"}
            onClick={() => setTab("original")}
            label="See original"
            dot="hard"
          />
        </div>
        <div className="flex items-center gap-2 px-3 shrink-0">
          <span
            aria-live="polite"
            className="min-w-[56px] text-right text-[11.5px] text-fg-3"
          >
            {tab === "editor"
              ? saving
                ? "Saving…"
                : saved
                ? "Saved"
                : "\u00A0"
              : "\u00A0"}
          </span>
          <StatusControl
            status={status}
            onSetStatus={onSetStatus}
            pending={statusPending}
            variant="compact"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={requestReset}
            disabled={draft === originalCode}
            className="h-7 px-2 text-[12px] text-fg-2 hover:text-fg hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent"
            title="Reset to original buggy code"
          >
            Reset
          </Button>
        </div>
      </div>

      {tab === "original" && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-rule bg-hard/10 text-[11.5px] text-hard/90">
          <LockIcon />
          <span>Read-only. Switch to "Your solution" to edit.</span>
        </div>
      )}

      <div ref={editorHostRef} className="flex-1 min-h-[400px] min-w-0 relative">
        {/* Always-mounted editable Monaco. Visibility is toggled rather than
            remounting on tab switch so the draft, undo stack, and cursor
            position survive intact. */}
        <div className={tab === "editor" ? "absolute inset-0" : "absolute inset-0 invisible pointer-events-none"}>
          <Editor
            defaultValue={initialCode}
            language={language}
            onChange={handleChange}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              scrollBeyondLastLine: false,
              padding: { top: 12, bottom: 12 },
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
              wrappingIndent: "indent",
              renderLineHighlight: "line",
            }}
          />
        </div>

        {/* "See original" overlay — a separate read-only viewer that doesn't
            touch the editor's state. */}
        {tab === "original" && (
          <div className="absolute inset-0 bg-[#1e1e1e]">
            <CodeViewer code={originalCode} language={language} height="100%" />
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  sublabel,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
  dot?: "brand" | "hard";
}) {
  return (
    <button
      onClick={onClick}
      className={`relative group flex items-center gap-2 px-4 py-2.5 text-[12.5px] transition ${
        active
          ? "text-fg bg-surface"
          : "text-fg-3 hover:text-fg-2 hover:bg-surface-3/40"
      }`}
    >
      {dot && (
        <span
          className={`size-1.5 rounded-full ${
            dot === "brand" ? "bg-brand" : "bg-hard"
          }`}
        />
      )}
      <span className="font-medium">{label}</span>
      {sublabel && (
        <span className="text-[10.5px] font-mono text-fg-3">{sublabel}</span>
      )}
      {active && (
        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-brand" />
      )}
    </button>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
