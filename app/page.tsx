import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TRACK_IDS, TRACK_META } from "@/lib/db/types";

export default function Home() {
  return (
    <main className="flex flex-col">
      {/* ──────────────────────────── HERO ─────────────────────────── */}
      <section className="mx-auto w-full max-w-[1400px] px-6 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="flex flex-col">
            <div className="inline-flex self-start items-center gap-2 rounded-full border border-rule bg-surface-2 px-3 py-1 text-[12px] text-fg-2 mb-6">
              <span className="inline-block size-1.5 rounded-full bg-brand" />
              Open-source code review practice · 10 language tracks
            </div>

            <h1 className="text-[clamp(2.5rem,5.5vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-fg">
              The fastest path from mid to{" "}
              <span className="text-brand">senior</span> is reading.
            </h1>

            <p className="mt-6 max-w-[52ch] text-[16px] leading-[1.65] text-fg-2">
              Seniors don&rsquo;t write more code. They read it sharper. Real
              broken snippets to train your eye, paired with an AI tutor.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                render={<Link href="/tracks" />}
                className="bg-brand text-[#0a0a0a] hover:bg-brand/90 h-11 px-5 text-[14px] font-medium rounded-md"
              >
                Sign in to start practicing →
              </Button>
            </div>
          </div>

          {/* LeetCode-style problem preview card */}
          <ProblemPreview />
        </div>
      </section>

      {/* ──────────────────────── PROBLEMS TABLE ───────────────────────── */}
      <section className="mx-auto w-full max-w-[1400px] px-6 py-16 border-t border-rule">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="text-[12px] uppercase tracking-wider text-fg-3 mb-1">
              Tracks
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-fg">
              Ten languages. Pick one.
            </h2>
          </div>
          <div className="text-[13px] text-fg-3">
            Own the one you ship in. Learn the next one you want to be trusted with.
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-rule bg-surface-2">
          {/* header row */}
          <div className="hidden md:grid grid-cols-[48px_1.3fr_1fr_110px] items-center gap-4 px-5 py-3 border-b border-rule text-[11.5px] uppercase tracking-wider text-fg-3 bg-surface-3/40">
            <span>#</span>
            <span>Track</span>
            <span>Focus</span>
            <span className="text-right">Open</span>
          </div>
          {TRACK_IDS.map((t, i) => (
            <Link
              key={t}
              href={`/tracks/${t}`}
              className="group grid grid-cols-[48px_1fr] md:grid-cols-[48px_1.3fr_1fr_110px] items-center gap-4 px-5 py-4 border-b border-rule last:border-b-0 hover:bg-surface-3/50 transition"
            >
              <span className="text-[13px] text-fg-3 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex items-center gap-3">
                <LangMark track={t} />
                <div className="flex flex-col">
                  <span className="text-[14.5px] font-medium text-fg group-hover:text-brand transition">
                    {TRACK_META[t].label}
                  </span>
                  <span className="md:hidden text-[12.5px] text-fg-3">
                    {TRACK_META[t].blurb}
                  </span>
                </div>
              </div>
              <span className="hidden md:block text-[13.5px] text-fg-2 truncate">
                {TRACK_META[t].blurb}
              </span>
              <div className="hidden md:flex items-center justify-end gap-2 text-[13.5px] text-fg-2 tabular-nums">
                <span className="text-fg-3 group-hover:text-brand group-hover:translate-x-0.5 transition">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ───────────────────────── HOW IT WORKS ────────────────────────── */}
      <section className="mx-auto w-full max-w-[1400px] px-6 py-16 border-t border-rule">
        <div className="mb-10">
          <div className="text-[12px] uppercase tracking-wider text-fg-3 mb-1">
            How it works
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-fg">
            Senior is a reading skill. Practice it here.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              n: "01",
              t: "Real broken code",
              d: "Leaky file handles, silent SQL injection, races in forEach. Pulled from patterns you meet at work — not whiteboard bait.",
            },
            {
              n: "02",
              t: "Spot it. Fix it.",
              d: "Mark what's wrong in a Monaco editor. Rewrite it your way. Drafts autosave. No timer, no pressure.",
            },
            {
              n: "03",
              t: "Argue with a senior",
              d: "An AI reviewer that has read every problem. Probes like a staff engineer on your PR. You earn the correctness.",
            },
          ].map((s) => (
            <article
              key={s.n}
              className="rounded-lg border border-rule bg-surface-2 p-6 hover:border-fg-3 transition"
            >
              <div className="text-[11px] font-mono text-brand mb-3 tracking-wider">
                {s.n}
              </div>
              <h3 className="text-[16px] font-medium text-fg mb-2">{s.t}</h3>
              <p className="text-[13.5px] leading-[1.65] text-fg-2">{s.d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ────────────────────────────── FOOTER ─────────────────────────── */}
      <footer className="mx-auto w-full max-w-[1400px] px-6 py-10 border-t border-rule">
        <div className="flex flex-wrap items-center justify-between gap-4 text-[13px] text-fg-3">
          <div className="flex items-center gap-2">
            <span className="inline-grid place-items-center size-6 rounded-md bg-brand text-[#0a0a0a] text-[13px] font-bold">
              C
            </span>
            <span className="text-fg-2">CodeRevu</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <nav className="flex gap-5">
            <Link href="/tracks" className="hover:text-fg">Problems</Link>
            <Link href="/terms" className="hover:text-fg">Terms</Link>
            <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

/* LeetCode-inflected two-letter language mark. Color-coded per track so the
   problem list reads at a glance. */
function LangMark({ track }: { track: string }) {
  const marks: Record<string, { label: string; color: string }> = {
    python:     { label: "Py", color: "#4584b6" },
    javascript: { label: "JS", color: "#f7df1e" },
    react:      { label: "Rx", color: "#61dafb" },
    ruby:       { label: "Rb", color: "#cc342d" },
    rails:      { label: "Rl", color: "#d30001" },
    java:       { label: "Jv", color: "#f89820" },
    csharp:     { label: "C#", color: "#a179dc" },
    rust:       { label: "Rs", color: "#dea584" },
    php:        { label: "Ph", color: "#777bb3" },
    go:         { label: "Go", color: "#00add8" },
  };
  const m = marks[track] ?? { label: "?", color: "#888" };
  return (
    <span
      className="inline-grid place-items-center size-8 rounded-md text-[11.5px] font-mono font-medium shrink-0"
      style={{
        background: `color-mix(in oklab, ${m.color} 16%, transparent)`,
        color: m.color,
        border: `1px solid color-mix(in oklab, ${m.color} 30%, transparent)`,
      }}
    >
      {m.label}
    </span>
  );
}

/* LeetCode-style problem description pane. Mimics the "description + code"
   split, with difficulty pill, tags, and syntax-tinted code. */
function ProblemPreview() {
  return (
    <div className="rounded-lg border border-rule bg-surface-2 overflow-hidden shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]">
      {/* title row */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-rule">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-mono text-fg-3">#001</span>
          <span className="text-[14px] font-medium text-fg">
            Leaky CSV reader
          </span>
        </div>
        <span className="inline-flex items-center h-[22px] px-2 rounded-md pill-easy text-[11.5px] font-medium">
          Easy
        </span>
      </div>

      {/* tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-rule text-[12.5px]">
        <Tab active>Description</Tab>
        <Tab>Solution</Tab>
        <Tab>Discuss</Tab>
      </div>

      {/* body */}
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Tag>python</Tag>
          <Tag>resource-management</Tag>
          <Tag>exceptions</Tag>
        </div>

        <p className="text-[13.5px] leading-[1.6] text-fg-2 mb-4">
          A nightly job occasionally fails with{" "}
          <code className="font-mono text-[12.5px] px-1.5 py-0.5 rounded bg-surface-3 text-fg">
            OSError: [Errno 24] Too many open files
          </code>
          . Find the leak.
        </p>

        {/* syntax-ish code window */}
        <div className="rounded-md border border-rule bg-[#111] overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-rule">
            <span className="size-2.5 rounded-full bg-hard/70" />
            <span className="size-2.5 rounded-full bg-medium/70" />
            <span className="size-2.5 rounded-full bg-brand/70" />
            <span className="ml-2 text-[11.5px] font-mono text-fg-3">
              main.py
            </span>
          </div>
          <pre className="overflow-x-auto text-[12.5px] font-mono leading-[1.7] py-3">
            <code>
              {"  "}<Num>1</Num>{" "}<K>import</K>{" "}csv{"\n"}
              {"  "}<Num>2</Num>{"\n"}
              {"  "}<Num>3</Num>{" "}<K>def</K>{" "}<Fn>extract_emails</Fn>(path: <T>str</T>) -&gt; <T>list</T>[<T>str</T>]:{"\n"}
              {"  "}<Num>4</Num>{"     "}f = <Fn>open</Fn>(path, <S>&quot;r&quot;</S>, encoding=<S>&quot;utf-8&quot;</S>){"\n"}
              {"  "}<Num>5</Num>{"     "}reader = csv.<Fn>DictReader</Fn>(f){"\n"}
              {"  "}<Num>6</Num>{"     "}emails = [ ]{"\n"}
              {"  "}<Num>7</Num>{"     "}<K>for</K> row <K>in</K> reader:{"\n"}
              {"  "}<Num>8</Num>{"         "}emails.<Fn>append</Fn>(row[<S>&quot;email&quot;</S>].<Fn>strip</Fn>().<Fn>lower</Fn>()){"\n"}
              {"  "}<Num>9</Num>{"     "}f.<Fn>close</Fn>(){"\n"}
              {"  "}<Num>10</Num>{"    "}<K>return</K> emails{"\n"}
            </code>
          </pre>
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between border-t border-rule px-5 py-3 text-[12.5px] text-fg-3">
        <span>Acceptance 61% · Avg 4m 20s</span>
        <span className="text-brand">Try it →</span>
      </div>
    </div>
  );
}

function Tab({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={`px-3 py-1.5 rounded-md transition ${
        active
          ? "bg-surface-3 text-fg font-medium"
          : "text-fg-3 hover:text-fg hover:bg-surface-3/50"
      }`}
    >
      {children}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11.5px] px-2 py-0.5 rounded-md bg-surface-3 text-fg-2 border border-rule">
      {children}
    </span>
  );
}

/* tiny syntax-color helpers, sized to match the editor */
function K({ children }: { children: React.ReactNode }) {
  return <span className="text-[#c586c0]">{children}</span>;
}
function Fn({ children }: { children: React.ReactNode }) {
  return <span className="text-[#dcdcaa]">{children}</span>;
}
function T({ children }: { children: React.ReactNode }) {
  return <span className="text-[#4ec9b0]">{children}</span>;
}
function S({ children }: { children: React.ReactNode }) {
  return <span className="text-[#ce9178]">{children}</span>;
}
function Num({ children }: { children: React.ReactNode }) {
  return <span className="text-fg-3 select-none">{children}</span>;
}
