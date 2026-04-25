"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProgressState } from "@/components/problem-workspace";

/* Dropdown select for To Do / In Progress / Complete. User can pick any of
   the three states — server confirms optimistically in the parent. */

type Variant = "full" | "compact";

type Item = { value: ProgressState; label: string };
const ITEMS: Item[] = [
  { value: "todo", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
];

export function StatusControl({
  status,
  onSetStatus,
  pending,
  variant = "full",
}: {
  status: ProgressState;
  onSetStatus: (next: ProgressState) => void;
  pending: boolean;
  variant?: Variant;
}) {
  const active = ITEMS.find((i) => i.value === status) ?? ITEMS[0];
  const tone = triggerTone(status);
  const height = variant === "compact" ? "h-7" : "h-9";
  const textSize = variant === "compact" ? "text-[11.5px]" : "text-[12.5px]";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Problem status"
        disabled={pending}
        className={`inline-flex items-center gap-1.5 ${height} px-2.5 rounded-md border ${textSize} font-medium transition disabled:opacity-50 ${tone}`}
      >
        <StatusDot status={status} active />
        <span>{active.label}</span>
        <ChevronIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[var(--anchor-width)] border-rule bg-surface-2"
      >
        {ITEMS.map((item) => {
          const isCurrent = item.value === status;
          return (
            <DropdownMenuItem
              key={item.value}
              onClick={() => {
                if (item.value !== status) onSetStatus(item.value);
              }}
              className={`flex items-center gap-2 ${textSize} ${
                isCurrent ? "text-fg" : "text-fg-2"
              }`}
            >
              <StatusDot status={item.value} active />
              <span className="flex-1">{item.label}</span>
              {isCurrent && <CheckIcon />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function triggerTone(status: ProgressState): string {
  if (status === "in-progress") {
    return "bg-medium/15 text-medium border-medium/30 hover:bg-medium/20";
  }
  if (status === "complete") {
    return "bg-brand/15 text-brand border-brand/40 hover:bg-brand/20";
  }
  return "bg-surface-2 text-fg border-rule hover:bg-surface-3";
}

function StatusDot({ status, active }: { status: ProgressState; active: boolean }) {
  const color =
    status === "todo"
      ? active
        ? "bg-fg-2"
        : "bg-fg-3"
      : status === "in-progress"
      ? "bg-medium"
      : "bg-brand";
  return (
    <span
      className={`inline-block size-1.5 rounded-full ${color} ${
        active && status === "in-progress" ? "animate-pulse" : ""
      }`}
    />
  );
}

function ChevronIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="opacity-70"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* Small inline pill used in header/title areas, purely display (non-interactive). */
export function StatusPill({ status }: { status: ProgressState }) {
  const cls =
    status === "complete"
      ? "bg-brand/15 border-brand/40 text-brand"
      : status === "in-progress"
      ? "bg-medium/15 border-medium/30 text-medium"
      : "bg-surface-2 border-rule text-fg-3";
  const label =
    status === "complete" ? "Complete" : status === "in-progress" ? "In Progress" : "To Do";
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border text-[11px] font-medium ${cls}`}
    >
      <StatusDot status={status} active />
      {label}
    </span>
  );
}
