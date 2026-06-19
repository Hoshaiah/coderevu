import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { listTrackProblems, problemId as makeProblemId } from "@/lib/db/problems";
import { listProgressByProblemIds } from "@/lib/db/progress";
import { isTrackId, normalizeProgressStatus, TRACK_META } from "@/lib/db/types";
import type { Difficulty, ProblemDoc } from "@/lib/db/types";

export default async function TrackPage(
  props: PageProps<"/tracks/[track]">,
) {
  const { track } = await props.params;
  if (!isTrackId(track)) notFound();

  const session = await getSessionUser();
  const rawProblems: ProblemDoc[] = await listTrackProblems(track);
  const difficultyRank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
  const problems = [...rawProblems].sort(
    (a, b) =>
      difficultyRank[a.difficulty] - difficultyRank[b.difficulty] ||
      a.orderIndex - b.orderIndex,
  );
  const meta = TRACK_META[track];

  // Group problems by their primary tag (first tag). Within each category,
  // sort easy → medium → hard. Categories appear in the order they first
  // occur in the track's topics list (which is the canonical order), with
  // any leftover categories appended alphabetically.
  function categoryOf(p: ProblemDoc): string {
    return p.tags[0] ?? "uncategorized";
  }
  const groupedMap = new Map<string, ProblemDoc[]>();
  for (const p of problems) {
    const c = categoryOf(p);
    const arr = groupedMap.get(c) ?? [];
    arr.push(p);
    groupedMap.set(c, arr);
  }
  const topicOrder = meta.topics;
  const seenCats = Array.from(groupedMap.keys());
  const orderedCats = [
    ...topicOrder.filter((t) => groupedMap.has(t)),
    ...seenCats.filter((c) => !topicOrder.includes(c)).sort(),
  ];
  const grouped = orderedCats.map((cat) => ({
    category: cat,
    problems: (groupedMap.get(cat) ?? []).sort(
      (a, b) =>
        difficultyRank[a.difficulty] - difficultyRank[b.difficulty] ||
        a.orderIndex - b.orderIndex,
    ),
  }));

  // Batch-load progress for all problems so each row can render the user's
  // current status pill (todo / in-progress / complete).
  const progressMap = session
    ? await listProgressByProblemIds(
        session.uid,
        problems.map((p) => makeProblemId(track, p.slug)),
      )
    : {};

  // tallies for the hero strip
  const counts = problems.reduce(
    (acc, p) => {
      acc[p.difficulty] += 1;
      return acc;
    },
    { easy: 0, medium: 0, hard: 0 } as Record<Difficulty, number>,
  );
  const total = problems.length;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:py-14">
      {/* breadcrumb */}
      <Link
        href="/tracks"
        className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg transition"
      >
        ← All tracks
      </Link>

      {/* track header */}
      <header className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start pb-6 border-b border-rule">
        <div className="flex items-start gap-4">
          <div
            className="shrink-0 grid place-items-center size-14 rounded-xl border"
            style={{
              background: `color-mix(in oklab, ${meta.brand} 10%, transparent)`,
              borderColor: `color-mix(in oklab, ${meta.brand} 25%, var(--rule))`,
            }}
          >
            <Image
              src={`/icons/tracks/${track}.svg`}
              alt=""
              width={32}
              height={32}
              unoptimized
            />
          </div>
          <div>
            <div className="text-[12px] uppercase tracking-wider text-fg-3 mb-1">
              Track · {meta.monacoLanguage}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-fg">
              {meta.label}
            </h1>
            <p className="mt-1.5 text-[14px] text-fg-2">{meta.blurb}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {meta.topics.map((tp) => (
                <span
                  key={tp}
                  className="inline-flex h-[22px] items-center px-2 rounded-md border border-rule bg-surface-2 text-[11.5px] font-mono text-fg-2"
                >
                  {tp}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* right — difficulty tally */}
        {total > 0 && (
          <div className="grid grid-cols-4 gap-3 min-w-[320px]">
            <Tally n={total} label="Total" />
            <Tally n={counts.easy} label="Easy" tone="easy" />
            <Tally n={counts.medium} label="Med" tone="medium" />
            <Tally n={counts.hard} label="Hard" tone="hard" />
          </div>
        )}
      </header>

      {/* problem list */}
      {problems.length === 0 ? (
        <div className="mt-10 rounded-lg border border-rule bg-surface-2 p-12 text-center text-fg-3">
          No problems yet. Run{" "}
          <code className="px-1.5 py-0.5 rounded bg-surface-3 text-fg font-mono text-[12.5px]">
            pnpm seed
          </code>{" "}
          to import content.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {grouped.map(({ category, problems: groupProblems }) => (
            <section
              key={category}
              className="rounded-lg border border-rule bg-surface-2 overflow-hidden"
            >
              {/* category header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-rule bg-surface-3/60">
                <h3 className="text-[12px] uppercase tracking-[0.14em] text-fg font-medium flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-brand" />
                  {prettifyCategory(category)}
                </h3>
                <span className="text-[11px] text-fg-3 tabular-nums">
                  {groupProblems.length} problem
                  {groupProblems.length === 1 ? "" : "s"}
                </span>
              </div>

              {/* column header */}
              <div className="hidden md:grid grid-cols-[52px_112px_1fr_auto_84px] items-center gap-4 px-4 py-2.5 border-b border-rule bg-surface-3/40 text-[11px] uppercase tracking-wider text-fg-3">
                <span>#</span>
                <span>Status</span>
                <span>Problem</span>
                <span>Tags</span>
                <span className="text-right">Difficulty</span>
              </div>

              {groupProblems.map((p) => {
            const status = normalizeProgressStatus(
              progressMap[makeProblemId(track, p.slug)]?.status,
            );
            return (
              <Link
                key={p.slug}
                href={`/tracks/${track}/${p.slug}`}
                className="group grid grid-cols-[52px_1fr] md:grid-cols-[52px_112px_1fr_auto_84px] items-center gap-4 px-4 py-3.5 border-b border-rule last:border-b-0 transition hover:bg-surface-3/50"
              >
                <span className="text-[12px] font-mono text-fg-3 tabular-nums">
                  {String(p.orderIndex).padStart(3, "0")}
                </span>

                {/* mobile: status + title on top, tags + difficulty on bottom */}
                <div className="md:hidden flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusPill status={status} />
                    <span className="text-[14px] font-medium text-fg group-hover:text-brand transition truncate">
                      {p.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <TagRow tags={p.tags.slice(0, 4)} />
                    <DifficultyPill d={p.difficulty} />
                  </div>
                </div>

                {/* desktop columns */}
                <span className="hidden md:inline-flex">
                  <StatusPill status={status} />
                </span>
                <div className="hidden md:flex items-center gap-2 min-w-0">
                  <span className="text-[14px] font-medium text-fg group-hover:text-brand transition truncate">
                    {p.title}
                  </span>
                </div>
                <div className="hidden md:block">
                  <TagRow tags={p.tags.slice(0, 4)} />
                </div>
                <span className="hidden md:inline-flex justify-end">
                  <DifficultyPill d={p.difficulty} />
                </span>
              </Link>
            );
          })}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

const CATEGORY_LABEL_OVERRIDES: Record<string, string> = {
  "n+1": "N+1",
  "sql": "SQL",
  "xml": "XML",
  "xss": "XSS",
  "csrf": "CSRF",
  "api": "API",
  "io": "I/O",
  "jwt": "JWT",
  "orm": "ORM",
  "ui": "UI",
  "ux": "UX",
  "url": "URL",
  "http": "HTTP",
  "id": "ID",
  "db": "DB",
  "uuid": "UUID",
  "json": "JSON",
  "yaml": "YAML",
  "active-record": "ActiveRecord",
  "xxe": "XXE",
};

function prettifyCategory(c: string): string {
  return c
    .split("-")
    .map((w) => CATEGORY_LABEL_OVERRIDES[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function DifficultyPill({ d }: { d: Difficulty }) {
  const cls =
    d === "easy"
      ? "pill-easy"
      : d === "medium"
      ? "pill-medium"
      : "pill-hard";
  const label = d === "easy" ? "Easy" : d === "medium" ? "Medium" : "Hard";
  return (
    <span
      className={`inline-flex items-center h-[22px] px-2 rounded-md ${cls} text-[11.5px] font-medium`}
    >
      {label}
    </span>
  );
}

function StatusPill({
  status,
}: {
  status: "todo" | "in-progress" | "complete";
}) {
  const cfg =
    status === "complete"
      ? {
          label: "Complete",
          cls: "bg-brand/15 text-brand border-brand/40",
          dot: "bg-brand",
        }
      : status === "in-progress"
      ? {
          label: "In Progress",
          cls: "bg-medium/15 text-medium border-medium/30",
          dot: "bg-medium animate-pulse",
        }
      : {
          label: "To Do",
          cls: "bg-surface-3 text-fg-3 border-rule",
          dot: "bg-fg-3",
        };
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border text-[11px] font-medium ${cfg.cls}`}
    >
      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex h-[20px] items-center px-1.5 rounded-md border border-rule bg-surface text-[10.5px] font-mono text-fg-3"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function Tally({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone?: "easy" | "medium" | "hard";
}) {
  const toneCls =
    tone === "easy"
      ? "text-easy"
      : tone === "medium"
      ? "text-medium"
      : tone === "hard"
      ? "text-hard"
      : "text-fg";
  return (
    <div className="rounded-lg border border-rule bg-surface-2 px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wider text-fg-3">{label}</div>
      <div className={`text-[18px] font-semibold tabular-nums leading-tight ${toneCls}`}>
        {n}
      </div>
    </div>
  );
}
