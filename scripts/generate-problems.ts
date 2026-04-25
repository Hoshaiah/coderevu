import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { TRACK_IDS, TRACK_META, type TrackId } from "../lib/db/types";

const CONTENT_DIR = path.resolve(process.cwd(), "content");
const MODEL = process.env.GEN_MODEL ?? "claude-sonnet-4-6";
// Total NEW problems to generate per track, split across multiple API calls
// if larger than GEN_BATCH.
const PROBLEMS_PER_TRACK = Number(process.env.GEN_COUNT ?? 9);
// Problems per API call. Keep small enough to fit in model output reliably.
const GEN_BATCH = Number(process.env.GEN_BATCH ?? 10);
// orderIndex of the first new problem (writes 003, 004, …). Existing
// problems up to START_INDEX-1 are left alone.
const START_INDEX = Number(process.env.GEN_START ?? 2);
// Comma-separated track filter. Empty = all tracks.
const GEN_ONLY = (process.env.GEN_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type GeneratedProblem = {
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  context_md: string;
  buggy_code: string;
  reference_solution: string;
  explanation_md: string;
  // Optional per-problem language override. Used by mixed tracks (javascript
  // bundles js/ts/react; ruby bundles pure ruby + rails but both render as
  // "ruby"). Defaults to TRACK_META[track].monacoLanguage when absent.
  language?: string;
};

// Per-track extra guidance for the generator: sub-language distribution,
// framework mix, etc. These append to the main user prompt.
const TRACK_EXTRAS: Partial<Record<TrackId, string>> = {
  javascript: `This track combines vanilla JavaScript, TypeScript, and React. For this batch, mix the three: use each problem's \`language\` field to indicate the variant ("javascript" for plain JS, "typescript" for TS or React-with-TS). Spread the batch roughly 30% plain JS, 30% TypeScript, 40% React. Include a first tag that identifies the flavor: "javascript", "typescript", or "react" — then 1-3 bug-category tags.`,
  ruby: `This track combines pure Ruby (script, CLI, library bugs) with Rails (ActiveRecord, controllers, jobs). For this batch, aim for roughly 30% pure Ruby and 70% Rails problems. \`language\` stays "ruby" either way. Use the first tag to distinguish: "ruby" for pure-Ruby problems, "rails" for Rails problems — then 1-3 bug-category tags (like "active-record", "n+1", "security").`,
  kotlin: `Problems should feel like real Kotlin code: coroutines, null-safety, sealed classes, data classes, Kotlin-Java interop, and Android lifecycle traps. Use idiomatic Kotlin, not Java-translated-to-Kotlin. \`language\` is "kotlin".`,
  swift: `Problems should feel like real Swift code: optionals, value vs. reference semantics, ARC / retain cycles, async/await, actors, and SwiftUI state/binding bugs. Use idiomatic Swift. \`language\` is "swift".`,
};

const systemPrompt = `You are an expert code reviewer writing practice problems for a platform where developers learn to spot bugs in real-world code. Each problem presents a realistic snippet containing 1-3 distinct issues. Problems must:

- Feel like code pulled from a production codebase: real domain (HTTP handlers, ETL jobs, background workers, CLIs, DB access, etc.), realistic naming, believable surrounding context.
- Have a specific, concrete failure mode the reader is meant to find. Not style nits — actual correctness / safety / performance bugs.
- Span a range of difficulties (easy/medium/hard) and cover distinct bug categories (concurrency, resource management, security, correctness, perf, API misuse, error handling, etc.). Do not repeat bug categories within the same track.
- Be self-contained: the code must compile / run / parse on its own with standard stdlib or one named popular library.

Return STRICT JSON (no prose, no markdown fences around the JSON itself) matching the schema in the user message.`;

function userPrompt(
  track: TrackId,
  exemplarProblem: string,
  exemplarSolution: string,
  exemplarFromTrack: TrackId,
  existingSlugs: string[],
  count: number,
): string {
  const topics = TRACK_META[track].topics.join(", ");
  const extra = TRACK_EXTRAS[track];
  const crossTrackNote =
    exemplarFromTrack !== track
      ? `NOTE: The example below is from the ${exemplarFromTrack} track because ${track} has no problems yet. Use it ONLY for tone/structure/depth — write your problems in idiomatic ${TRACK_META[track].label}, not in ${exemplarFromTrack}.\n\n`
      : "";
  return `Track: ${track} (${TRACK_META[track].label}).
Default language for code blocks: ${TRACK_META[track].monacoLanguage}.
Canonical bug categories for this track: ${topics}.
${extra ? `\nTrack-specific guidance:\n${extra}\n` : ""}
${crossTrackNote}Here is ONE existing problem as a style reference. Match its tone, depth, and structure — NOT its specific bug.

<example_problem>
${exemplarProblem}
</example_problem>

<example_solution>
${exemplarSolution}
</example_solution>

Existing slugs in this track (do NOT reuse or closely paraphrase): ${existingSlugs.join(", ") || "(none)"}.

Generate exactly ${count} NEW problems for this track. Each problem must cover a DIFFERENT specific bug from the example AND from each other. Spread across the canonical categories above — aim for balance, not all problems in one category. Span easy/medium/hard.

Return a single JSON object of the form:

{
  "problems": [
    {
      "slug": "kebab-case-unique-slug",
      "title": "short descriptive title, 3-6 words, Title Case, describes the bug — not the symptom (e.g. 'N+1 on Orders Index', 'Race in Coupon Redemption', 'Missing CSRF on Transfer'). NO sentences, NO periods, NO full-sentence symptom descriptions.",
      "language": "optional — omit to use the track default. Required when the track mixes multiple languages (see track-specific guidance above).",
      "difficulty": "easy" | "medium" | "hard",
      "tags": ["primary-category-first", "then", "2-3", "more"],
      "context_md": "2-4 paragraphs of rich context. Paragraph 1: where this code lives (file path, role in the system, surrounding stack). Paragraph 2: the observed symptom — what users/operators see, what logs/metrics show, when it shows up. Paragraph 3 (optional): any partial debugging context or what was already ruled out. This is where the wordy details go — the title stays short. Plain markdown, no headings.",
      "buggy_code": "The buggy code snippet. Plain source code, no markdown fences. Realistic indentation, 10-40 lines.",
      "reference_solution": "The fixed code snippet. Plain source code, no markdown fences.",
      "explanation_md": "Will be rewritten by the regen-solutions script later; for generation, supply 2-4 plain paragraphs covering the bug, the fix, edge cases. No headings."
    }
    // ...${count} total
  ]
}

Constraints:
- slug must be kebab-case, globally unique within the track, and descriptive of the bug (e.g. "race-on-counter-increment").
- title must be 3-6 words. If you're writing a full sentence, shorten it. The long explanation belongs in context_md.
- tags: 2-4 kebab-case tags. The FIRST tag must be the primary bug category from the canonical list above when possible — this is used for UI grouping. Example for rails: tags like ["n+1", "active-record", "performance"] or ["security", "authorization", "mass-assignment"].
- Never include markdown code fences (\`\`\`) inside buggy_code or reference_solution — those are raw source.
- context_md and explanation_md are markdown but MUST NOT contain \`##\` headings.
- Do not escape newlines as \\n — use real newlines in the JSON string values.`;
}

function hasAllProblems(trackDir: string, expectedCount: number): boolean {
  if (!fs.existsSync(trackDir)) return false;
  const dirs = fs
    .readdirSync(trackDir)
    .filter((d) => fs.statSync(path.join(trackDir, d)).isDirectory());
  return dirs.length >= expectedCount + 1; // +1 for the original 001
}

// Sibling track to borrow an exemplar from when a track is brand-new.
const EXEMPLAR_FALLBACK: Partial<Record<TrackId, TrackId>> = {
  kotlin: "java",
  swift: "csharp",
};

function readExemplar(
  track: TrackId,
): { problem: string; solution: string; slug: string; fromTrack: TrackId } | null {
  const tryDir = (t: TrackId) => {
    const trackDir = path.join(CONTENT_DIR, t);
    if (!fs.existsSync(trackDir)) return null;
    const dirs = fs
      .readdirSync(trackDir)
      .filter((d) => fs.statSync(path.join(trackDir, d)).isDirectory())
      .sort();
    if (dirs.length === 0) return null;
    const first = dirs[0];
    const problem = fs.readFileSync(path.join(trackDir, first, "problem.md"), "utf8");
    const solution = fs.readFileSync(path.join(trackDir, first, "solution.md"), "utf8");
    const slug = first.replace(/^\d+-/, "");
    return { problem, solution, slug, fromTrack: t };
  };
  return tryDir(track) ?? (EXEMPLAR_FALLBACK[track] ? tryDir(EXEMPLAR_FALLBACK[track]!) : null);
}

function existingSlugs(track: TrackId): string[] {
  const trackDir = path.join(CONTENT_DIR, track);
  if (!fs.existsSync(trackDir)) return [];
  return fs
    .readdirSync(trackDir)
    .filter((d) => fs.statSync(path.join(trackDir, d)).isDirectory())
    .map((d) => d.replace(/^\d+-/, ""));
}

function yamlEscape(s: string): string {
  // Titles go inside double quotes in the frontmatter. Escape backslashes and quotes.
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function writeProblem(
  track: TrackId,
  orderIndex: number,
  p: GeneratedProblem,
): { problemPath: string; solutionPath: string } | null {
  const dirName = `${String(orderIndex).padStart(3, "0")}-${p.slug}`;
  const dir = path.join(CONTENT_DIR, track, dirName);
  if (fs.existsSync(dir)) return null;
  fs.mkdirSync(dir, { recursive: true });

  const language = (p.language?.trim() || TRACK_META[track].monacoLanguage).toLowerCase();

  const frontmatter = [
    "---",
    `slug: ${p.slug}`,
    `track: ${track}`,
    `orderIndex: ${orderIndex}`,
    `title: "${yamlEscape(p.title)}"`,
    `difficulty: ${p.difficulty}`,
    `tags: [${p.tags.map((t) => JSON.stringify(t)).join(", ")}]`,
    `language: ${language}`,
    "---",
    "",
  ].join("\n");

  const problemMd = [
    frontmatter,
    "## Context",
    "",
    p.context_md.trim(),
    "",
    "## Buggy code",
    "",
    "```" + language,
    p.buggy_code.trim(),
    "```",
    "",
  ].join("\n");

  const solutionMd = [
    "## Reference solution",
    "",
    "```" + language,
    p.reference_solution.trim(),
    "```",
    "",
    "## Explanation",
    "",
    p.explanation_md.trim(),
    "",
  ].join("\n");

  const problemPath = path.join(dir, "problem.md");
  const solutionPath = path.join(dir, "solution.md");
  fs.writeFileSync(problemPath, problemMd);
  fs.writeFileSync(solutionPath, solutionMd);
  return { problemPath, solutionPath };
}

function parseGeneration(raw: string): GeneratedProblem[] {
  // Strip any accidental code fences around the JSON.
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(trimmed) as { problems?: GeneratedProblem[] };
  if (!parsed.problems || !Array.isArray(parsed.problems)) {
    throw new Error("Response did not contain a `problems` array");
  }
  return parsed.problems;
}

function nextOrderIndexForTrack(track: TrackId): number {
  const trackDir = path.join(CONTENT_DIR, track);
  if (!fs.existsSync(trackDir)) return 1;
  const indices = fs
    .readdirSync(trackDir)
    .filter((d) => fs.statSync(path.join(trackDir, d)).isDirectory())
    .map((d) => parseInt(d.split("-")[0], 10))
    .filter((n) => Number.isFinite(n));
  return (indices.length === 0 ? 0 : Math.max(...indices)) + 1;
}

async function generateForTrack(client: Anthropic, track: TrackId): Promise<number> {
  const exemplar = readExemplar(track);
  if (!exemplar) {
    console.warn(`[${track}] no exemplar found (and no fallback), skipping`);
    return 0;
  }

  const slugs = existingSlugs(track);
  const remaining = PROBLEMS_PER_TRACK;
  // If GEN_START is explicitly set, honour it; otherwise append after the
  // highest existing orderIndex so reruns don't clobber prior work.
  const startIndex =
    process.env.GEN_START !== undefined ? START_INDEX : nextOrderIndexForTrack(track);
  console.log(
    `[${track}] generating ${remaining} problems starting at orderIndex ${startIndex} (batch size ${GEN_BATCH})`,
  );

  const existing = new Set(slugs);
  let nextIndex = startIndex;
  let wrote = 0;
  let generated = 0;
  while (generated < remaining) {
    const batchCount = Math.min(GEN_BATCH, remaining - generated);
    console.log(`[${track}] batch of ${batchCount} (so far: ${wrote}/${remaining})`);
    let resp;
    try {
      resp = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt(
              track,
              exemplar.problem,
              exemplar.solution,
              exemplar.fromTrack,
              Array.from(existing),
              batchCount,
            ),
          },
        ],
      });
    } catch (err) {
      console.error(`[${track}] API call failed:`, (err as Error).message);
      throw err;
    }

    const textBlock = resp.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error(`[${track}] no text block in response`);
    }

    let problems: GeneratedProblem[];
    try {
      problems = parseGeneration(textBlock.text);
    } catch (err) {
      console.error(`[${track}] parse failed: ${(err as Error).message} — skipping batch`);
      generated += batchCount; // avoid infinite loop on systematic failure
      continue;
    }

    for (const p of problems) {
      if (!p.slug || existing.has(p.slug)) {
        console.warn(`[${track}] skipping duplicate/empty slug "${p.slug}"`);
        continue;
      }
      existing.add(p.slug);
      const result = writeProblem(track, nextIndex, p);
      if (result) {
        console.log(`  ✓ ${track}/${String(nextIndex).padStart(3, "0")}-${p.slug}`);
        nextIndex += 1;
        wrote += 1;
      }
      generated += 1;
      if (generated >= remaining) break;
    }
  }

  return wrote;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const client = new Anthropic();

  const tracks =
    GEN_ONLY.length > 0
      ? (TRACK_IDS.filter((t) => GEN_ONLY.includes(t)))
      : [...TRACK_IDS];

  const results = await Promise.allSettled(
    tracks.map((t) => generateForTrack(client, t)),
  );

  let total = 0;
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      total += r.value;
    } else {
      failed += 1;
      console.error(`[${tracks[i]}] FAILED:`, r.reason);
    }
  });

  console.log(`\nGenerated ${total} problem(s) across ${tracks.length} track(s).`);
  if (failed > 0) {
    console.log(`${failed} track(s) failed — rerun the script to retry only those.`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
