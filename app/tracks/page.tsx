import Image from "next/image";
import Link from "next/link";
import { TRACK_IDS, TRACK_META, type TrackId } from "@/lib/db/types";

export default async function TracksPage() {
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
            Ten tracks of real broken snippets. Sequenced from the bugs a solid
            mid catches to the ones only a staff engineer would.
          </p>
        </div>
      </div>

      {/* track grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TRACK_IDS.map((t) => (
          <TrackCard key={t} track={t} />
        ))}
      </div>
    </main>
  );
}

function TrackCard({ track }: { track: TrackId }) {
  const meta = TRACK_META[track];

  return (
    <Link
      href={`/tracks/${track}`}
      className="group relative flex flex-col rounded-lg border border-rule bg-surface-2 p-5 transition hover:border-brand/60 hover:bg-surface-2/80"
    >
      {/* top row — icon + label */}
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
              unoptimized
            />
          </div>
          <div className="min-w-0 flex flex-col">
            <div className="text-[15px] font-semibold text-fg leading-tight truncate">
              {meta.label}
            </div>
          </div>
        </div>
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

      {/* CTA row */}
      <div className="mt-5 pt-4 border-t border-rule flex items-center justify-between text-[12.5px]">
        <span className="text-fg-2">Open track</span>
        <span className="inline-flex items-center gap-1 transition text-brand group-hover:translate-x-0.5">
          Open →
        </span>
      </div>
    </Link>
  );
}
