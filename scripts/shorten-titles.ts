import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { config as loadEnv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { TRACK_IDS, TRACK_META, type TrackId } from "../lib/db/types";

const CONTENT_DIR = path.resolve(process.cwd(), "content");
const MODEL = process.env.SHORTEN_MODEL ?? "claude-haiku-4-5-20251001";
const ONLY = (process.env.SHORTEN_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type Job = {
  track: TrackId;
  dir: string;
  problemPath: string;
  slug: string;
  currentTitle: string;
  context: string;
};

const systemPrompt = `You rewrite long problem titles into short punchy ones.
Rules:
- 3–6 words.
- Title Case.
- No trailing period.
- Describe the BUG, not the symptom. "N+1 on Orders Index", not "Orders index page generates hundreds of queries".
- Keep technical tokens intact (N+1, SQL, XXE, CSRF, UTC, etc.).
Return ONLY the new title as a single line of plain text — no quotes, no prefix, no markdown.`;

function userPromptFor(job: Job): string {
  return `Track: ${job.track} (${TRACK_META[job.track].label}).
Slug: ${job.slug}
Current (too-long) title: ${job.currentTitle}
Brief context (for understanding the bug):
${job.context.slice(0, 900)}

Rewrite the title.`;
}

function listJobs(): Job[] {
  const jobs: Job[] = [];
  const tracks = ONLY.length > 0 ? TRACK_IDS.filter((t) => ONLY.includes(t)) : TRACK_IDS;
  for (const track of tracks) {
    const trackDir = path.join(CONTENT_DIR, track);
    if (!fs.existsSync(trackDir)) continue;
    const entries = fs
      .readdirSync(trackDir)
      .filter((d) => fs.statSync(path.join(trackDir, d)).isDirectory())
      .sort();
    for (const entry of entries) {
      const dir = path.join(trackDir, entry);
      const problemPath = path.join(dir, "problem.md");
      if (!fs.existsSync(problemPath)) continue;
      const raw = fs.readFileSync(problemPath, "utf8");
      const parsed = matter(raw);
      const fm = parsed.data as { slug?: string; title?: string };
      if (!fm.title || !fm.slug) continue;
      const wordCount = fm.title.trim().split(/\s+/).length;
      if (wordCount <= 6) continue; // already short enough
      jobs.push({
        track,
        dir,
        problemPath,
        slug: fm.slug,
        currentTitle: fm.title,
        context: parsed.content,
      });
    }
  }
  return jobs;
}

function replaceTitle(md: string, newTitle: string): string {
  return md.replace(/^title:\s*".*?"\s*$/m, `title: "${newTitle.replace(/"/g, '\\"')}"`);
}

async function run(client: Anthropic, job: Job): Promise<string> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 60,
    system: systemPrompt,
    messages: [{ role: "user", content: userPromptFor(job) }],
  });
  const tb = resp.content.find((b) => b.type === "text");
  if (!tb || tb.type !== "text") throw new Error("no text");
  const newTitle = tb.text.trim().replace(/^["']|["']$/g, "").replace(/\.$/, "").trim();
  if (!newTitle) throw new Error("empty title");
  return newTitle;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic();
  const jobs = listJobs();
  console.log(`${jobs.length} titles to shorten.\n`);
  let done = 0;
  for (const job of jobs) {
    try {
      const newTitle = await run(client, job);
      const raw = fs.readFileSync(job.problemPath, "utf8");
      fs.writeFileSync(job.problemPath, replaceTitle(raw, newTitle));
      console.log(`  ✓ ${job.track}/${path.basename(job.dir)}: "${job.currentTitle}" → "${newTitle}"`);
      done += 1;
    } catch (err) {
      console.error(`  ✗ ${job.track}/${path.basename(job.dir)}: ${(err as Error).message}`);
    }
  }
  console.log(`\nShortened ${done}/${jobs.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
