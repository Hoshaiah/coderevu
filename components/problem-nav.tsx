"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Shuffle, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TRACK_META, type TrackId } from "@/lib/db/types";

export type NavProblem = {
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
};

const STORAGE_KEY = "coderevu_show_problem_tags";

function readShowTags(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function applyShowTags(show: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.prefsTags = show ? "" : "hidden";
}

export function ProblemNav({
  track,
  problems,
  currentSlug,
}: {
  track: TrackId;
  problems: NavProblem[];
  currentSlug: string;
}) {
  const router = useRouter();
  const [showTags, setShowTags] = useState(true);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    const initial = readShowTags();
    setShowTags(initial);
    applyShowTags(initial);
  }, []);

  const meta = TRACK_META[track];
  const currentIndex = problems.findIndex((p) => p.slug === currentSlug);
  const prev = currentIndex > 0 ? problems[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < problems.length - 1 ? problems[currentIndex + 1] : null;

  function toggleTags() {
    const next = !showTags;
    setShowTags(next);
    applyShowTags(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore storage failures
    }
  }

  function shuffle() {
    const others = problems.filter((p) => p.slug !== currentSlug);
    if (others.length === 0) return;
    const pick = others[Math.floor(Math.random() * others.length)];
    router.push(`/tracks/${track}/${pick.slug}`);
  }

  return (
    <div className="flex items-center justify-between gap-2 h-11 px-3 border-b border-rule bg-surface-2">
      {/* Left: track label, clickable, opens problem-list modal */}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogTrigger
          className="inline-flex items-center gap-2 h-8 px-2 -mx-2 rounded-md text-[13px] font-medium text-fg hover:bg-surface-3/60 transition"
          aria-label={`Open ${meta.label} problem list`}
        >
          <span
            className="size-2 rounded-full"
            style={{ background: meta.brand }}
            aria-hidden
          />
          {meta.label}
          <span className="text-fg-3 text-[11px] font-normal tabular-nums">
            {currentIndex >= 0 ? `${currentIndex + 1} / ${problems.length}` : ""}
          </span>
        </DialogTrigger>
        <DialogContent className="max-w-[640px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: meta.brand }}
                aria-hidden
              />
              {meta.label} problems
            </DialogTitle>
          </DialogHeader>
          <ul className="mt-2 -mx-2 overflow-y-auto divide-y divide-rule">
            {problems.map((p, i) => {
              const active = p.slug === currentSlug;
              return (
                <li key={p.slug}>
                  <Link
                    href={`/tracks/${track}/${p.slug}`}
                    onClick={() => setListOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 text-[13px] transition ${
                      active
                        ? "bg-brand/10 text-fg"
                        : "text-fg-2 hover:bg-surface-3/60 hover:text-fg"
                    }`}
                  >
                    <span className="w-7 text-[11px] font-mono text-fg-3 tabular-nums shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 truncate">{p.title}</span>
                    <DifficultyDot d={p.difficulty} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Right: tag toggle + prev/next/shuffle */}
      <div className="flex items-center gap-1">
        <NavBtn
          onClick={toggleTags}
          title={showTags ? "Hide tags" : "Show tags"}
          aria-label={showTags ? "Hide tags" : "Show tags"}
        >
          {showTags ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </NavBtn>
        <span className="mx-1 h-5 w-px bg-rule" aria-hidden />
        {prev ? (
          <Link
            href={`/tracks/${track}/${prev.slug}`}
            className="inline-flex items-center justify-center size-8 rounded-md text-fg-2 hover:bg-surface-3/60 hover:text-fg transition"
            aria-label={`Previous: ${prev.title}`}
            title={`Prev: ${prev.title}`}
          >
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span className="inline-flex items-center justify-center size-8 rounded-md text-fg-3/40 cursor-not-allowed">
            <ChevronLeft className="size-4" />
          </span>
        )}
        <NavBtn onClick={shuffle} title="Shuffle" aria-label="Shuffle to a random problem">
          <Shuffle className="size-3.5" />
        </NavBtn>
        {next ? (
          <Link
            href={`/tracks/${track}/${next.slug}`}
            className="inline-flex items-center justify-center size-8 rounded-md text-fg-2 hover:bg-surface-3/60 hover:text-fg transition"
            aria-label={`Next: ${next.title}`}
            title={`Next: ${next.title}`}
          >
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="inline-flex items-center justify-center size-8 rounded-md text-fg-3/40 cursor-not-allowed">
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </div>
  );
}

function NavBtn({
  onClick,
  title,
  children,
  "aria-label": ariaLabel,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className="inline-flex items-center justify-center size-8 rounded-md text-fg-2 hover:bg-surface-3/60 hover:text-fg transition"
    >
      {children}
    </button>
  );
}

function DifficultyDot({ d }: { d: "easy" | "medium" | "hard" }) {
  const cls = d === "easy" ? "bg-easy" : d === "medium" ? "bg-medium" : "bg-hard";
  return <span className={`size-2 rounded-full shrink-0 ${cls}`} aria-hidden />;
}
