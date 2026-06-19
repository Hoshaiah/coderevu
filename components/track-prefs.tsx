"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Prefs = {
  showTags: boolean;
  hideCompleted: boolean;
};

const DEFAULT_PREFS: Prefs = {
  showTags: true,
  hideCompleted: false,
};

const STORAGE_KEY = "coderevu_track_prefs";

function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function applyPrefs(p: Prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.prefsTags = p.showTags ? "" : "hidden";
  root.dataset.prefsCompleted = p.hideCompleted ? "hidden" : "";
}

export function TrackPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [open, setOpen] = useState(false);

  // Hydrate from localStorage and apply on first paint.
  useEffect(() => {
    const stored = readPrefs();
    setPrefs(stored);
    applyPrefs(stored);
  }, []);

  function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable (private mode, quota). Silent fallback.
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="List preferences"
        className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-rule bg-surface-2 text-[12.5px] text-fg-2 hover:bg-surface-3 hover:text-fg transition"
      >
        <SlidersHorizontal className="size-3.5" />
        <span className="hidden sm:inline">List options</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>List preferences</DialogTitle>
          <DialogDescription>
            Tweak how problems are displayed. Saved to this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 divide-y divide-rule rounded-md border border-rule bg-surface">
          <PrefRow
            label="Show tags"
            description="Display per-problem tag chips on each row."
            checked={prefs.showTags}
            onChange={(v) => update({ showTags: v })}
          />
          <PrefRow
            label="Hide completed"
            description="Hide problems you've already marked as Complete."
            checked={prefs.hideCompleted}
            onChange={(v) => update({ hideCompleted: v })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrefRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 px-4 py-3 cursor-pointer">
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-fg">{label}</span>
        <span className="block text-[12px] text-fg-3">{description}</span>
      </span>
      <Toggle checked={checked} onChange={onChange} ariaLabel={label} />
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition ${
        checked
          ? "bg-brand/80 border-brand"
          : "bg-surface-3 border-rule"
      }`}
    >
      <span
        className={`inline-block size-[16px] rounded-full bg-fg shadow transition-transform ${
          checked ? "translate-x-[19px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}
