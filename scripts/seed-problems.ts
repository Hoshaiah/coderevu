import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { config as loadEnv } from "dotenv";
import { Timestamp } from "firebase-admin/firestore";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { adminDb } from "../lib/firebase/admin";
import { TRACK_IDS, isTrackId } from "../lib/db/types";
import { problemId } from "../lib/db/problems";

const CONTENT_DIR = path.resolve(process.cwd(), "content");

type ProblemFrontmatter = {
  slug: string;
  track: string;
  orderIndex: number;
  title: string;
  difficulty: "easy" | "medium" | "hard";
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

async function seedOne(problemDir: string): Promise<boolean> {
  const problemPath = path.join(problemDir, "problem.md");
  const solutionPath = path.join(problemDir, "solution.md");
  if (!fs.existsSync(problemPath) || !fs.existsSync(solutionPath)) {
    console.warn(`skip ${problemDir} (missing problem.md or solution.md)`);
    return false;
  }

  const problemRaw = fs.readFileSync(problemPath, "utf8");
  const solutionRaw = fs.readFileSync(solutionPath, "utf8");
  const { data, content: problemBody } = matter(problemRaw);
  const fm = data as ProblemFrontmatter;

  if (!isTrackId(fm.track)) {
    throw new Error(`Invalid track "${fm.track}" in ${problemPath}`);
  }

  const sections = splitSections(problemBody);
  const context = sections["context"] ?? stripFirstCodeBlock(problemBody);
  const buggyCode =
    extractFirstCodeBlock(sections["buggy code"] ?? "") || extractFirstCodeBlock(problemBody);

  const solSections = splitSections(solutionRaw);
  const referenceSolution =
    extractFirstCodeBlock(solSections["reference solution"] ?? "") ||
    extractFirstCodeBlock(solutionRaw);
  const explanation = solSections["explanation"] ?? stripFirstCodeBlock(solutionRaw);

  const id = problemId(fm.track, fm.slug);
  const ref = adminDb().collection("problems").doc(id);
  const snap = await ref.get();
  const createdAt = snap.exists ? (snap.data()?.createdAt as Timestamp) : Timestamp.now();

  await ref.set({
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
    createdAt,
  });
  console.log(`✓ ${id}`);
  return true;
}

async function main() {
  let count = 0;
  for (const track of TRACK_IDS) {
    const trackDir = path.join(CONTENT_DIR, track);
    if (!fs.existsSync(trackDir)) continue;
    for (const entry of fs.readdirSync(trackDir)) {
      const full = path.join(trackDir, entry);
      if (!fs.statSync(full).isDirectory()) continue;
      const ok = await seedOne(full);
      if (ok) count += 1;
    }
  }
  console.log(`\nSeeded ${count} problem(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
