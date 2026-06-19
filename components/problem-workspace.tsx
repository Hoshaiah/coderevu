"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { toast } from "sonner";
import { ProblemPanel } from "@/components/problem-panel";
import { ChatPanel } from "@/components/chat-panel";
import { ReferencePanel } from "@/components/reference-panel";
import { setStatus as setStatusAction } from "@/app/actions/progress";

// Monaco is heavy. Keep it out of the initial bundle / server module graph
// so dev-mode Turbopack doesn't blow its memory budget on every recompile.
const CodeEditor = dynamic(
  () => import("@/components/code-editor").then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 grid place-items-center bg-[#1e1e1e] text-fg-3 text-[12px]">
        Loading editor…
      </div>
    ),
  },
);

type Message = { role: "user" | "assistant"; content: string };

// Three user-facing states. Auto: "todo" → "in-progress" on first edit.
// Manual: any of the three via the status control.
export type ProgressState = "todo" | "in-progress" | "complete";

export function ProblemWorkspace({
  problemId,
  title,
  difficulty,
  tags,
  context,
  buggyCode,
  referenceSolution,
  explanation,
  language,
  initiallyRevealed,
  initialStatus,
  initialDraft,
  initialMessages,
  aiEnabled,
}: {
  problemId: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  context: string;
  buggyCode: string;
  referenceSolution: string;
  explanation: string;
  language: string;
  initiallyRevealed: boolean;
  initialStatus: ProgressState;
  initialDraft: string;
  initialMessages: Message[];
  aiEnabled: boolean;
}) {
  const draftRef = useRef<string>(initialDraft);
  const [, setTick] = useState(0);
  const [tutorOpen, setTutorOpen] = useState(true);
  const [revealed, setRevealed] = useState(initiallyRevealed);
  const [status, setStatusLocal] = useState<ProgressState>(initialStatus);
  const [referenceExpanded, setReferenceExpanded] = useState(false);
  const [statusPending, startStatus] = useTransition();

  const tutorPanelRef = useRef<ImperativePanelHandle>(null);

  const updateDraft = useCallback(
    (next: string) => {
      draftRef.current = next;
      if (status === "todo" && next !== buggyCode) {
        setStatusLocal("in-progress");
        startStatus(async () => {
          try {
            await setStatusAction(problemId, "in-progress");
          } catch (err) {
            console.error(err);
          }
        });
      }
      setTick((t) => (t + 1) % 1_000_000);
    },
    [status, buggyCode, problemId],
  );

  const getDraft = useCallback(() => draftRef.current, []);

  const setStatus = useCallback(
    (next: ProgressState) => {
      if (next === status) return;
      const prev = status;
      setStatusLocal(next);
      startStatus(async () => {
        try {
          await setStatusAction(problemId, next);
        } catch (err) {
          console.error(err);
          setStatusLocal(prev);
          toast.error("Could not update status");
        }
      });
    },
    [status, problemId],
  );

  useEffect(() => {
    const p = tutorPanelRef.current;
    if (!p) return;
    if (tutorOpen && p.isCollapsed()) p.expand();
    else if (!tutorOpen && !p.isCollapsed()) p.collapse();
  }, [tutorOpen]);

  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId="coderevu:workspace"
      style={{ height: "calc(100dvh - 3.5rem)" }}
    >
      <Panel defaultSize={32} minSize={20} maxSize={55} className="flex min-w-0">
        {referenceExpanded ? (
          <ReferencePanel
            referenceSolution={referenceSolution}
            language={language}
            explanation={explanation}
            onCollapse={() => setReferenceExpanded(false)}
          />
        ) : (
          <div className="flex-1 min-w-0 overflow-y-auto bg-surface">
            <ProblemPanel
              problemId={problemId}
              title={title}
              difficulty={difficulty}
              tags={tags}
              context={context}
              referenceSolution={referenceSolution}
              language={language}
              explanation={explanation}
              revealed={revealed}
              onReveal={() => setRevealed(true)}
              onExpandReference={() => setReferenceExpanded(true)}
              status={status}
              onSetStatus={setStatus}
              statusPending={statusPending}
            />
          </div>
        )}
      </Panel>

      <ResizeHandle />

      <Panel defaultSize={42} minSize={25} className="flex min-w-0">
        <div className="flex-1 min-w-0 min-h-[400px] flex flex-col bg-surface">
          <CodeEditor
            problemId={problemId}
            initialCode={initialDraft}
            originalCode={buggyCode}
            language={language}
            onChange={updateDraft}
            status={status}
            onSetStatus={setStatus}
            statusPending={statusPending}
          />
        </div>
      </Panel>

      <ResizeHandle />

      <Panel
        ref={tutorPanelRef}
        defaultSize={26}
        minSize={16}
        maxSize={50}
        collapsible
        collapsedSize={3}
        onCollapse={() => setTutorOpen(false)}
        onExpand={() => setTutorOpen(true)}
        className="flex min-w-0"
      >
        <ChatPanel
          problemId={problemId}
          initialMessages={initialMessages}
          getDraft={getDraft}
          open={tutorOpen}
          onToggle={() => setTutorOpen((v) => !v)}
          aiEnabled={aiEnabled}
        />
      </Panel>
    </PanelGroup>
  );
}

function ResizeHandle() {
  return (
    <PanelResizeHandle className="group relative w-px bg-rule data-[resize-handle-state=hover]:bg-brand data-[resize-handle-state=drag]:bg-brand transition-colors">
      <span className="absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize" />
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-[3px] items-center justify-center rounded-full bg-rule opacity-0 group-hover:opacity-100 group-data-[resize-handle-state=drag]:opacity-100 group-hover:bg-brand group-data-[resize-handle-state=drag]:bg-brand transition-opacity" />
    </PanelResizeHandle>
  );
}
