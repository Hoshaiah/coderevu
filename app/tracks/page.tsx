import Image from "next/image";
import Link from "next/link";
import { TRACK_IDS, TRACK_META, type TrackId } from "@/lib/db/types";
import { getSessionUser } from "@/lib/auth/session";
import { getUserDoc } from "@/lib/db/users";

type LockState = "unlocked" | "free" | "locked";

export default async function TracksPage() {
  const session = await getSessionUser();
  const user = session ? await getUserDoc(session.uid) : null;
  const paid =
    user?.subscription.status === "active" || user?.subscription.status === "past_due";
  const primary = user?.primaryTrack ?? null;

  function stateFor(t: TrackId): LockState {
    if (paid) return "unlocked";
    if (primary === t) return "free";
    return "locked";
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 py-10 md:py-14">
      {/* header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-8">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-fg-3 mb-1">
            Problems
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            Pick a language. Read it sharper.
          </h1>
          <p className="mt-2 text-[14px] text-fg-2 max-w-[56ch]">
            Ten tracks. A hundred real broken snippets each. Sequenced from the
            bugs a solid mid catches to the ones only a staff engineer would.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-fg-3">
          {!session ? (
            <span>
              <Link href="/pricing" className="text-fg hover:text-brand">
                Sign in
              </Link>{" "}
              to unlock your free track · 10 problems
            </span>
          ) : !paid && primary ? (
            <span>
              Free track:{" "}
              <span className="text-fg font-medium">{TRACK_META[primary].label}</span>
            </span>
          ) : paid ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-brand" /> Premium · all tracks unlocked
            </span>
          ) : null}
        </div>
      </div>

      {/* stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatBox label="Tracks" value="10" />
        <StatBox label="Problems" value="1,000" />
        <StatBox label="Languages" value="10" />
        <StatBox label="AI reviewer" value="included" accent />
      </div>

      {/* track grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TRACK_IDS.map((t) => {
          const state = stateFor(t);
          return <TrackCard key={t} track={t} state={state} />;
        })}
      </div>
    </main>
  );
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-rule bg-surface-2 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-fg-3">{label}</div>
      <div
        className={`mt-1 text-[22px] font-semibold tabular-nums leading-none ${
          accent ? "text-brand" : "text-fg"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function TrackCard({ track, state }: { track: TrackId; state: LockState }) {
  const meta = TRACK_META[track];
  const locked = state === "locked";

  return (
    <Link
      href={`/tracks/${track}`}
      aria-disabled={locked}
      className={`group relative flex flex-col rounded-lg border bg-surface-2 p-5 transition ${
        locked
          ? "border-rule hover:border-fg-3/60"
          : "border-rule hover:border-brand/60 hover:bg-surface-2/80"
      }`}
    >
      {/* top row — icon + label + state badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="relative shrink-0 grid place-items-center size-11 rounded-lg border border-rule overflow-hidden"
            style={{
              background: `color-mix(in oklab, ${meta.brand} 10%, transparent)`,
              borderColor: `color-mix(in oklab, ${meta.brand} 25%, var(--rule))`,
            }}
          >
            <Image
              src={`/icons/tracks/${meta.iconFile ?? `${track}.svg`}`}
              alt=""
              width={26}
              height={26}
              className={locked ? "opacity-70" : ""}
              unoptimized
            />
          </div>
          <div className="min-w-0 flex flex-col">
            <div className="text-[15px] font-semibold text-fg leading-tight truncate">
              {meta.label}
            </div>
          </div>
        </div>
        <StateBadge state={state} />
      </div>

      {/* blurb */}
      <p className="mt-4 text-[13.5px] leading-[1.55] text-fg-2">{meta.blurb}</p>

      {/* topic tags */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {meta.topics.map((tp) => (
          <span
            key={tp}
            className="inline-flex h-[22px] items-center px-2 rounded-md border border-rule bg-surface text-[11.5px] font-mono text-fg-2 group-hover:text-fg transition"
          >
            {tp}
          </span>
        ))}
      </div>

      {/* difficulty mix — compact inline legend, no chart */}
      <div className="mt-5 flex flex-col gap-1 text-[11.5px] text-fg-2">
        <div className="text-[10.5px] uppercase tracking-wider text-fg-3">
          Difficulty mix · 100
        </div>
        <div className="flex items-center gap-3 tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <LegendDot className="bg-easy" /> 40 Easy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LegendDot className="bg-medium" /> 45 Med
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LegendDot className="bg-hard" /> 15 Hard
          </span>
        </div>
      </div>

      {/* CTA row */}
      <div className="mt-5 pt-4 border-t border-rule flex items-center justify-between text-[12.5px]">
        <span className={locked ? "text-fg-3" : "text-fg-2"}>
          {locked
            ? "Upgrade to unlock all 100"
            : state === "free"
            ? "10 problems available free"
            : "100 problems · AI reviewer"}
        </span>
        <span
          className={`inline-flex items-center gap-1 transition ${
            locked ? "text-fg-3" : "text-brand group-hover:translate-x-0.5"
          }`}
        >
          {locked ? "Preview →" : "Open →"}
        </span>
      </div>
    </Link>
  );
}

function StateBadge({ state }: { state: LockState }) {
  if (state === "unlocked") {
    return (
      <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md pill-easy text-[11px] font-medium">
        <Dot /> Unlocked
      </span>
    );
  }
  if (state === "free") {
    return (
      <span className="inline-flex items-center h-[22px] px-2 rounded-md bg-brand text-[#0a0a0a] text-[11px] font-semibold">
        Free · 10
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md border border-rule text-[11px] text-fg-3">
      <LockIcon /> Locked
    </span>
  );
}

function Dot() {
  return <span className="size-1.5 rounded-full bg-easy inline-block" />;
}

function LegendDot({ className }: { className: string }) {
  return <span className={`size-1.5 rounded-full inline-block ${className}`} />;
}

function LockIcon() {
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
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
