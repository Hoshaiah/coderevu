import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  TRACK_IDS,
  isTrackId,
  type Difficulty,
  type ProblemDoc,
  type TrackId,
} from "@/lib/db/types";

// Problems live on disk under content/{track}/NNN-<slug>/{problem,solution}.md
// We read them at request time. Track listings cache per-track in memory for
// the lifetime of the server process.

const CONTENT_DIR = path.resolve(process.cwd(), "content");

// Composite "id" used as the progress / conversation key:
// `${track}__${slug}` so the database key has the track baked in.
export function problemId(track: TrackId, slug: string): string {
  return `${track}__${slug}`;
}

export function splitProblemId(id: string): { track: TrackId; slug: string } | null {
  const idx = id.indexOf("__");
  if (idx < 0) return null;
  const track = id.slice(0, idx);
  const slug = id.slice(idx + 2);
  if (!isTrackId(track)) return null;
  return { track, slug };
}

type Frontmatter = {
  slug: string;
  track: string;
  orderIndex: number;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  language: string;
};

function extractFirstCodeBlock(md: string): string {
  const match = md.match(/```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/);
  return match ? match[1].trimEnd() : "";
}

function stripFirstCodeBlock(md: string): string {
  return md.replace(/```[a-zA-Z0-9_+-]*\n[\s\S]*?```/, "").trim();
}

function splitSections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = md.split(/^## +/m);
  for (const p of parts.slice(1)) {
    const nl = p.indexOf("\n");
    if (nl === -1) continue;
    const title = p.slice(0, nl).trim().toLowerCase();
    const body = p.slice(nl + 1).trim();
    out[title] = body;
  }
  return out;
}

function readProblemDir(problemDir: string): ProblemDoc | null {
  const problemPath = path.join(problemDir, "problem.md");
  const solutionPath = path.join(problemDir, "solution.md");
  if (!fs.existsSync(problemPath) || !fs.existsSync(solutionPath)) return null;

  const problemRaw = fs.readFileSync(problemPath, "utf8");
  const solutionRaw = fs.readFileSync(solutionPath, "utf8");
  const { data, content: problemBody } = matter(problemRaw);
  const fm = data as Frontmatter;
  if (!isTrackId(fm.track)) return null;

  const sections = splitSections(problemBody);
  const context = sections["context"] ?? stripFirstCodeBlock(problemBody);
  const buggyCode =
    extractFirstCodeBlock(sections["buggy code"] ?? "") ||
    extractFirstCodeBlock(problemBody);

  const solSections = splitSections(solutionRaw);
  const referenceSolution =
    extractFirstCodeBlock(solSections["reference solution"] ?? "") ||
    extractFirstCodeBlock(solutionRaw);
  const explanation =
    solSections["explanation"] ?? stripFirstCodeBlock(solutionRaw);

  return {
    slug: fm.slug,
    track: fm.track,
    orderIndex: fm.orderIndex,
    title: fm.title,
    difficulty: fm.difficulty,
    tags: fm.tags ?? [],
    language: fm.language,
    context,
    buggyCode,
    referenceSolution,
    explanation,
  };
}

// Per-track cache — content is read-only at runtime, so a process-wide
// cache is safe and dodges a re-read of every problem on every request.
const trackCache = new Map<TrackId, ProblemDoc[]>();

export function listTrackProblems(track: TrackId): ProblemDoc[] {
  const cached = trackCache.get(track);
  if (cached) return cached;
  const trackDir = path.join(CONTENT_DIR, track);
  if (!fs.existsSync(trackDir)) {
    trackCache.set(track, []);
    return [];
  }
  const entries = fs.readdirSync(trackDir);
  const problems: ProblemDoc[] = [];
  for (const entry of entries) {
    const full = path.join(trackDir, entry);
    if (!fs.statSync(full).isDirectory()) continue;
    const p = readProblemDir(full);
    if (p) problems.push(p);
  }
  problems.sort((a, b) => a.orderIndex - b.orderIndex);
  trackCache.set(track, problems);
  return problems;
}

export function getProblemBySlug(track: TrackId, slug: string): ProblemDoc | null {
  return listTrackProblems(track).find((p) => p.slug === slug) ?? null;
}

export function getProblemById(id: string): ProblemDoc | null {
  const parts = splitProblemId(id);
  if (!parts) return null;
  return getProblemBySlug(parts.track, parts.slug);
}

// Eager warmup helper — used if you want a snapshot of every problem
// without hitting per-track lookups one at a time.
export function listAllProblems(): ProblemDoc[] {
  return TRACK_IDS.flatMap((t) => listTrackProblems(t));
}
