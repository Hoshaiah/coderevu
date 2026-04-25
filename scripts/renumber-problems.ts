import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

import { TRACK_IDS, TRACK_META, type TrackId } from "../lib/db/types";

const CONTENT_DIR = path.resolve(process.cwd(), "content");

type ProblemMeta = {
  trackDir: string;
  dirName: string;
  fullPath: string;
  problemPath: string;
  solutionPath: string;
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  orderIndex: number;
};

const DIFFICULTY_RANK: Record<ProblemMeta["difficulty"], number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

function readProblems(track: TrackId): ProblemMeta[] {
  const trackDir = path.join(CONTENT_DIR, track);
  if (!fs.existsSync(trackDir)) return [];
  const entries = fs
    .readdirSync(trackDir)
    .filter((d) => fs.statSync(path.join(trackDir, d)).isDirectory());
  const out: ProblemMeta[] = [];
  for (const dirName of entries) {
    const fullPath = path.join(trackDir, dirName);
    const problemPath = path.join(fullPath, "problem.md");
    if (!fs.existsSync(problemPath)) continue;
    const { data } = matter(fs.readFileSync(problemPath, "utf8"));
    const fm = data as {
      slug?: string;
      title?: string;
      difficulty?: ProblemMeta["difficulty"];
      tags?: string[];
      orderIndex?: number;
    };
    if (!fm.slug || !fm.title || !fm.difficulty) continue;
    out.push({
      trackDir,
      dirName,
      fullPath,
      problemPath,
      solutionPath: path.join(fullPath, "solution.md"),
      slug: fm.slug,
      title: fm.title,
      difficulty: fm.difficulty,
      tags: fm.tags ?? [],
      orderIndex: fm.orderIndex ?? 0,
    });
  }
  return out;
}

// Same sort the track page applies: by category (in TRACK_META.topics order
// when matched, else alphabetical for the rest), then easy→medium→hard,
// then existing orderIndex as a stable tiebreak.
function sortProblems(track: TrackId, problems: ProblemMeta[]): ProblemMeta[] {
  const topics = TRACK_META[track].topics;
  const categoryOf = (p: ProblemMeta) => p.tags[0] ?? "uncategorized";
  const allCategories = new Set(problems.map(categoryOf));
  const orderedCats = [
    ...topics.filter((t) => allCategories.has(t)),
    ...[...allCategories].filter((c) => !topics.includes(c)).sort(),
  ];
  const catRank = new Map(orderedCats.map((c, i) => [c, i] as const));
  return [...problems].sort((a, b) => {
    const ra = catRank.get(categoryOf(a)) ?? 999;
    const rb = catRank.get(categoryOf(b)) ?? 999;
    if (ra !== rb) return ra - rb;
    const da = DIFFICULTY_RANK[a.difficulty];
    const db = DIFFICULTY_RANK[b.difficulty];
    if (da !== db) return da - db;
    return a.orderIndex - b.orderIndex;
  });
}

function rewriteOrderIndex(p: ProblemMeta, newIndex: number): void {
  const raw = fs.readFileSync(p.problemPath, "utf8");
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;
  fm.orderIndex = newIndex;
  fs.writeFileSync(p.problemPath, matter.stringify(parsed.content, fm));
}

function renumberTrack(track: TrackId): { changed: number; total: number } {
  const problems = readProblems(track);
  if (problems.length === 0) return { changed: 0, total: 0 };
  const sorted = sortProblems(track, problems);

  // Two-phase rename to avoid collisions. Move to a temp suffix first, then
  // to the final NNN- prefix.
  const tmp: { from: string; to: string }[] = [];
  const final: { from: string; tempName: string; finalName: string }[] = [];
  sorted.forEach((p, i) => {
    const newIndex = i + 1;
    const newDirName = `${String(newIndex).padStart(3, "0")}-${p.slug}`;
    if (newDirName === p.dirName && p.orderIndex === newIndex) {
      // already in correct position with correct frontmatter
      return;
    }
    const tempName = `__renumber__${newIndex}_${p.slug}`;
    tmp.push({ from: p.fullPath, to: path.join(p.trackDir, tempName) });
    final.push({
      from: path.join(p.trackDir, tempName),
      tempName,
      finalName: newDirName,
    });
  });

  // Phase 1: move all to temp names
  for (const m of tmp) fs.renameSync(m.from, m.to);
  // Update frontmatter on disk while at temp paths
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const newIndex = i + 1;
    if (p.orderIndex !== newIndex) {
      const inMove = tmp.find((t) => path.basename(t.from) === p.dirName);
      if (inMove) {
        const tempProblem = path.join(inMove.to, "problem.md");
        const raw = fs.readFileSync(tempProblem, "utf8");
        const parsed = matter(raw);
        const fm = parsed.data as Record<string, unknown>;
        fm.orderIndex = newIndex;
        fs.writeFileSync(tempProblem, matter.stringify(parsed.content, fm));
      } else {
        // already in correct dir but stale orderIndex (shouldn't usually hit)
        rewriteOrderIndex(p, newIndex);
      }
    }
  }
  // Phase 2: move from temp to final names
  for (const m of final) {
    const trackDir = path.dirname(m.from);
    const finalPath = path.join(trackDir, m.finalName);
    fs.renameSync(m.from, finalPath);
  }

  return { changed: tmp.length, total: sorted.length };
}

function main() {
  let totalProblems = 0;
  let totalChanged = 0;
  for (const track of TRACK_IDS) {
    const { changed, total } = renumberTrack(track);
    if (total === 0) continue;
    console.log(`[${track}] renumbered ${changed}/${total}`);
    totalProblems += total;
    totalChanged += changed;
  }
  console.log(`\nProcessed ${totalProblems} problem(s); ${totalChanged} repositioned.`);
}

main();
