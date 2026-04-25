"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ChatRole = "user" | "assistant";
type Message = { role: ChatRole; content: string };

const META_SENTINEL = "\n\n---META---\n";

const QUICK_SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: "Check my answer",
    prompt:
      "Check my current answer against the reference solution. Don't reveal the solution yet — just tell me whether each numbered issue is addressed and point me at any line that's still wrong.",
  },
  {
    label: "Slight hint",
    prompt:
      "Give me a slight hint about what's wrong. Name the line or symptom area but don't write the fix.",
  },
  {
    label: "Explain solution",
    prompt:
      "Walk me through the reference solution. Cover what each CHANGE does and why.",
  },
];

export function ChatPanel({
  problemId,
  initialMessages,
  initialSpentUsd,
  capUsd,
  enabled,
  getDraft,
  open,
  onToggle,
}: {
  problemId: string;
  initialMessages: Message[];
  initialSpentUsd: number;
  capUsd: number;
  enabled: boolean;
  getDraft: () => string;
  open: boolean;
  onToggle: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [spentUsd, setSpentUsd] = useState(initialSpentUsd);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const pct = Math.min(100, capUsd > 0 ? (spentUsd / capUsd) * 100 : 0);
  const capReached = spentUsd >= capUsd;

  function fillSuggestion(prompt: string) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch("/api/ai/chat/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problemId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessages([]);
      setInput("");
      toast.success("Chat reset for this problem.");
    } catch (err) {
      console.error(err);
      toast.error("Could not reset chat.");
    } finally {
      setResetting(false);
      setResetOpen(false);
    }
  }

  // Collapsed rail — vertical label + expand button
  if (!open) {
    return (
      <aside className="border-l border-rule bg-surface flex flex-col items-center">
        <button
          onClick={onToggle}
          className="w-full h-full flex flex-col items-center gap-3 py-3 hover:bg-surface-2 transition group"
          aria-label="Open AI tutor"
          title="Open AI tutor"
        >
          <ExpandIcon className="text-fg-3 group-hover:text-fg transition" />
          <span
            className="text-[11px] font-medium tracking-[0.2em] uppercase text-fg-3 group-hover:text-fg transition"
            style={{ writingMode: "vertical-rl" }}
          >
            AI tutor
          </span>
          <span className="size-1.5 rounded-full bg-brand mt-1" />
        </button>
      </aside>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    if (capReached) {
      toast.error("Monthly AI budget reached.");
      return;
    }

    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setStreaming(true);

    const assistantStart: Message = { role: "assistant", content: "" };
    setMessages([...next, assistantStart]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problemId, messages: next, draft: getDraft() }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        throw new Error(err || "Chat failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let meta: { newSpentUsd?: number } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const idx = buf.indexOf(META_SENTINEL);
        if (idx >= 0) {
          const text = buf.slice(0, idx);
          const metaJson = buf.slice(idx + META_SENTINEL.length);
          setMessages([...next, { role: "assistant", content: text }]);
          try {
            meta = JSON.parse(metaJson);
          } catch {
            // partial metadata chunk; wait for next read
          }
          buf = "";
          continue;
        }

        setMessages([...next, { role: "assistant", content: buf }]);
      }

      if (meta?.newSpentUsd !== undefined) setSpentUsd(meta.newSpentUsd);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error(err);
      toast.error((err as Error).message || "Chat failed");
      setMessages(next);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  // Header — same whether enabled or not
  const header = (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-rule bg-surface-2">
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-brand" />
        <span className="text-[13px] font-medium text-fg">AI tutor</span>
      </div>
      <div className="flex items-center gap-2">
        {enabled && <CreditMeter pct={pct} />}
        {enabled && messages.length > 0 && (
          <button
            onClick={() => setResetOpen(true)}
            className="text-[11px] text-fg-3 hover:text-fg px-1.5 h-7 rounded-md hover:bg-surface-3 transition"
            title="Reset chat for this problem"
          >
            Reset
          </button>
        )}
        <button
          onClick={onToggle}
          className="size-7 grid place-items-center rounded-md text-fg-3 hover:text-fg hover:bg-surface-3 transition"
          aria-label="Collapse AI tutor"
          title="Collapse"
        >
          <CollapseIcon />
        </button>
      </div>
    </div>
  );

  if (!enabled) {
    return (
      <aside className="flex flex-col h-full min-w-0 overflow-hidden border-l border-rule bg-surface">
        {header}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="rounded-lg border border-rule bg-surface-2 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <div className="size-8 grid place-items-center rounded-md bg-surface-3 border border-rule shrink-0">
                <LockIcon />
              </div>
              <div className="text-[13px] font-medium text-fg">
                AI reviewer — Premium
              </div>
            </div>
            <p className="text-[12.5px] leading-[1.6] text-fg-2">
              Socratic, scoped to this exact snippet, and pushes back like a
              staff engineer on your PR.
            </p>
            <Button
              render={<Link href="/upgrade" />}
              className="w-full bg-brand text-[#0a0a0a] hover:bg-brand/90 h-9 text-[13px] font-medium"
            >
              Upgrade to unlock
            </Button>
          </div>

          <div className="rounded-lg border border-dashed border-rule p-4 text-[12.5px] leading-[1.55] text-fg-3">
            <div className="text-fg-2 font-medium mb-1.5">What you&rsquo;d use it for</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>Ask why your fix doesn&rsquo;t fully address the bug.</li>
              <li>Get probed on edge cases before you see the solution.</li>
              <li>Explain a line back in your own words, get corrected.</li>
            </ul>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col h-full min-w-0 overflow-hidden border-l border-rule bg-surface">
      {header}

      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-rule bg-surface-2 p-4 text-[12.5px] leading-[1.6] text-fg-3">
            Ask anything about this problem. Start with what you think is wrong —
            the tutor will probe before answering.
          </div>
        ) : null}
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} />
        ))}
      </div>

      {capReached ? (
        <div className="p-4 border-t border-rule bg-surface-2 text-[12px] text-fg-3">
          You&rsquo;ve used this month&rsquo;s AI budget. It resets on the 1st.
        </div>
      ) : (
        <div className="border-t border-rule bg-surface-2">
          {/* quick suggestion chips */}
          <div className="px-3 pt-3 flex flex-wrap gap-1.5">
            {QUICK_SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => fillSuggestion(s.prompt)}
                disabled={streaming}
                className="inline-flex items-center h-7 px-2.5 rounded-md border border-rule bg-surface text-[11.5px] text-fg-2 hover:text-fg hover:border-brand/60 hover:bg-surface-3 transition disabled:opacity-50"
                title={s.prompt}
              >
                {s.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-3 flex gap-2 min-w-0">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a specific line or approach…  (↵ to send · ⇧↵ for newline)"
              rows={2}
              className="flex-1 min-w-0 max-w-full resize-none [field-sizing:fixed] break-words text-[13px] bg-surface border-rule focus-visible:ring-brand focus-visible:border-brand"
              disabled={streaming}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button
              type="submit"
              disabled={streaming || !input.trim()}
              className="bg-brand text-[#0a0a0a] hover:bg-brand/90 h-auto self-stretch px-3.5 text-[13px] font-medium disabled:opacity-50"
            >
              {streaming ? "…" : "Send"}
            </Button>
          </form>
        </div>
      )}

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="bg-surface-2 border border-rule ring-1 ring-rule text-fg max-w-md">
          <DialogHeader className="pt-1">
            <DialogTitle className="text-fg text-[16px] font-semibold">
              Reset this problem&rsquo;s chat?
            </DialogTitle>
            <DialogDescription className="text-fg-2 leading-[1.6]">
              Clears every message in this conversation. The AI starts fresh
              for this problem only — your draft, progress, and other
              problems&rsquo; chats stay untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-transparent border-t-0 -mx-4 -mb-4 p-4 pt-2 sm:justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setResetOpen(false)}
              disabled={resetting}
              className="h-9 px-4 text-[13px] text-fg-2 hover:text-fg hover:bg-surface-3"
            >
              Keep chat
            </Button>
            <Button
              onClick={handleReset}
              disabled={resetting}
              className="h-9 px-4 text-[13px] font-medium bg-hard/15 text-hard border border-hard/30 hover:bg-hard hover:text-white hover:border-hard"
            >
              {resetting ? "Resetting…" : "Reset chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function MessageBubble({ role, content }: { role: ChatRole; content: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end min-w-0">
        <div className="max-w-[88%] min-w-0 rounded-lg bg-surface-3 text-fg px-3 py-2 text-[13px] whitespace-pre-wrap break-words leading-[1.55]">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="text-[13px] min-w-0 break-words">
      {content ? (
        <Markdown>{content}</Markdown>
      ) : (
        <div className="text-fg-3 text-[12px] flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-fg-3 animate-pulse" />
          <span className="inline-block size-1.5 rounded-full bg-fg-3 animate-pulse [animation-delay:150ms]" />
          <span className="inline-block size-1.5 rounded-full bg-fg-3 animate-pulse [animation-delay:300ms]" />
        </div>
      )}
    </div>
  );
}

function CreditMeter({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-hard" : pct >= 80 ? "bg-medium" : "bg-brand";
  const label = `${Math.round(pct)}%`;
  return (
    <div
      className="flex items-center gap-2 min-w-[110px]"
      title={`${label} of monthly AI budget used`}
    >
      <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] tabular-nums text-fg-3">{label} used</div>
    </div>
  );
}

function CollapseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="13 17 18 12 13 7" />
      <polyline points="6 17 11 12 6 7" />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-fg-3">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
