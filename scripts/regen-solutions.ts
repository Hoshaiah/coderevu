import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { config as loadEnv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { TRACK_IDS, TRACK_META, type TrackId } from "../lib/db/types";

const CONTENT_DIR = path.resolve(process.cwd(), "content");
const MODEL = process.env.GEN_MODEL ?? "claude-sonnet-4-6";
const CONCURRENCY = Number(process.env.REGEN_CONCURRENCY ?? 6);
// Only regen tracks provided, else all. e.g. REGEN_ONLY=ruby,rails
const REGEN_ONLY = (process.env.REGEN_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Further filter by problem slug (substring match on directory name), e.g.
// REGEN_SLUG=n-plus-one-orders or REGEN_SLUG=001,007
const REGEN_SLUG = (process.env.REGEN_SLUG ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type RegeneratedSolution = {
  issues: string[];
  reference_solution: string;
  explanation_md: string;
};

const systemPrompt = `You are a senior engineer writing a reference solution for a code-review practice problem. Output STRICT JSON. The reference solution must be runnable and correct, but — critically — it must include inline "CHANGE N" comments marking each site where the fix differs from the buggy code. You also provide a short numbered list of issues up front.`;

function commentPrefixFor(language: string): string {
  const l = language.toLowerCase();
  if (l === "python" || l === "ruby") return "#";
  return "//";
}

function extractBuggyCode(problemMd: string): string {
  // Grabs the first fenced code block in the buggy-code section.
  const match = problemMd.match(/```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/);
  return match ? match[1].trimEnd() : "";
}

function userPrompt(
  track: TrackId,
  title: string,
  language: string,
  contextMd: string,
  buggyCode: string,
): string {
  const prefix = commentPrefixFor(language);
  return `Track: ${track} (${TRACK_META[track].label}).
Language: ${language}.
Title: ${title}.
Comment syntax for this language: ${prefix}

Context (markdown):
<context>
${contextMd}
</context>

Buggy code you are fixing (raw):
<buggy>
${buggyCode}
</buggy>

Return a single JSON object of this shape:

{
  "issues": [
    "One-line description of issue 1 — concrete, names the failure mode.",
    "One-line description of issue 2 — different category.",
    // 2–5 items total
  ],
  "reference_solution": "Raw source code (no markdown fences) that compiles/parses as ${language}. It must include inline comments of the form \`${prefix} CHANGE N:\` at each change site, where N corresponds to the issues array (1-indexed). The CHANGE comments sit on the line immediately above or next to the fix and explain briefly what changed and why. Each CHANGE comment MUST be a SINGLE comment line — do NOT wrap the text across multiple \`${prefix}\` lines. Long sentences are fine; the UI wraps them automatically.",
  "explanation_md": "Markdown explanation with ONE distinct section per numbered issue (1-indexed, in the issues array order). Each section MUST follow this exact template and nothing else:\\n\\n### Issue N: <short descriptive name, 2–6 words>\\n\\n**Problem:** <plain-English description of what is wrong and what the user/operator actually sees as a symptom — concrete, not abstract. 1–3 sentences.>\\n\\n**Fix:** <name the exact code change at the CHANGE N site: what gets added, removed, or replaced. Reference the actual tokens/methods/lines from the reference solution. 1–3 sentences.>\\n\\n**Explanation:** <walk a mid-level engineer through WHY the bug happens and WHY the fix solves it. Step through the mechanism plainly. Include one concrete edge case or related pitfall if relevant. 3–6 short sentences.>\\n\\n---\\n\\n(separator between sections; omit the trailing \`---\` after the final section)\\n\\nTONE + CLARITY RULES:\\n- Write for a mid-level engineer. Plain, direct language.\\n- Prefer concrete over abstract. Say \\\"ActiveRecord runs one SELECT per order\\\" not \\\"N+1 problem scales linearly\\\".\\n- Avoid academic / PR-blog phrases: no \\\"classic\\\", \\\"catastrophic\\\", \\\"naturally\\\", \\\"simply\\\", \\\"of course\\\".\\n- Active voice. Present tense.\\n- Show, don't label. \\\"The view fires a query per row\\\" beats \\\"This is the classic N+1 problem\\\".\\n- No bullet lists (\`-\`, \`*\`), no numbered lists (\`1.\`), no tables, no code fences inside Problem/Fix/Explanation (short \`inline code\` is fine and encouraged for method/token names).\\n- No summary, intro, or closing paragraph outside the per-issue sections."
}

Constraints:
- Reference solution MUST use ${prefix} for comments (never the wrong prefix).
- Do NOT wrap the reference_solution in \`\`\` fences — it is raw source.
- Do NOT include a summary header inside reference_solution — the issues array handles that.
- Every issue in the issues array should correspond to at least one \`CHANGE N\` site in the code.
- The fix must be minimal and correct — don't rewrite the whole function unless necessary.
- Use real newlines in JSON string values, not \\n escapes.`;
}

function buildSolutionMarkdown(
  language: string,
  title: string,
  _issues: string[],
  referenceSolution: string,
  explanation: string,
): string {
  const prefix = commentPrefixFor(language);
  const divider = `${prefix} ${"-".repeat(72)}`;
  // The per-issue breakdown lives in the `### Issue N: …` sections of the
  // Explanation below, so the code header just names the overall problem.
  const header = [
    divider,
    `${prefix} ANSWER — ${title}`,
    divider,
    "",
  ].join("\n");

  return [
    "## Reference solution",
    "",
    "```" + language,
    header,
    referenceSolution.trim(),
    "```",
    "",
    "## Explanation",
    "",
    explanation.trim(),
    "",
  ].join("\n");
}

// Re-escape raw control characters (newline, tab, carriage return) that the
// model emitted verbatim inside JSON string literals. Walk the string,
// track whether we're inside a "…" and whether the prior char was a `\`,
// and escape unescaped control chars when inside a string.
function escapeControlInJsonStrings(s: string): string {
  let out = "";
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escapeNext) {
      out += ch;
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inString = !inString;
      continue;
    }
    if (inString) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      // any other control char
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

function parseResponse(raw: string): RegeneratedSolution {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/```$/, "").trim();
  let parsed: RegeneratedSolution;
  try {
    parsed = JSON.parse(trimmed) as RegeneratedSolution;
  } catch {
    // Models sometimes emit literal newlines/tabs inside JSON string values,
    // which strict JSON.parse rejects. Walk the string and escape control
    // chars that appear while we're inside a double-quoted string literal.
    parsed = JSON.parse(escapeControlInJsonStrings(trimmed)) as RegeneratedSolution;
  }
  if (!parsed.issues || !Array.isArray(parsed.issues)) throw new Error("missing issues[]");
  if (!parsed.reference_solution) throw new Error("missing reference_solution");
  if (!parsed.explanation_md) throw new Error("missing explanation_md");
  return parsed;
}

type Job = {
  track: TrackId;
  dir: string;
  problemPath: string;
  solutionPath: string;
  title: string;
  language: string;
  contextMd: string;
  buggyCode: string;
};

function alreadyRegenerated(solutionPath: string): boolean {
  if (!fs.existsSync(solutionPath)) return false;
  const content = fs.readFileSync(solutionPath, "utf8");
  // Solution must be in the CHANGE-marker format AND the Explanation section
  // must be bullet-pointed (top-level bullets like "- **1. …**"). Older files
  // regenerated under the prose-paragraph prompt get picked up and redone.
  const solutionOk = /ANSWER —/.test(content) && /\bCHANGE\s+\d/.test(content);
  if (!solutionOk) return false;
  const explanationSection = content.split(/^## +Explanation\s*$/im)[1] ?? "";
  return /^###\s+Issue\s+\d+:/m.test(explanationSection);
}

function listJobs(): Job[] {
  const jobs: Job[] = [];
  const force = process.env.REGEN_FORCE === "1";
  const tracks = REGEN_ONLY.length > 0
    ? (TRACK_IDS.filter((t) => REGEN_ONLY.includes(t)))
    : TRACK_IDS;

  for (const track of tracks) {
    const trackDir = path.join(CONTENT_DIR, track);
    if (!fs.existsSync(trackDir)) continue;
    const entries = fs
      .readdirSync(trackDir)
      .filter((d) => fs.statSync(path.join(trackDir, d)).isDirectory())
      .sort();
    for (const entry of entries) {
      if (REGEN_SLUG.length > 0 && !REGEN_SLUG.some((s) => entry.includes(s))) continue;
      const dir = path.join(trackDir, entry);
      const problemPath = path.join(dir, "problem.md");
      const solutionPath = path.join(dir, "solution.md");
      if (!fs.existsSync(problemPath)) continue;
      if (!force && alreadyRegenerated(solutionPath)) continue;

      const raw = fs.readFileSync(problemPath, "utf8");
      const { data, content } = matter(raw);
      const fm = data as { title?: string; language?: string };
      if (!fm.title || !fm.language) continue;

      // Strip buggy-code section from context, keep just context paragraphs
      const sections = splitSections(content);
      const contextMd = sections["context"] ?? stripFirstCodeBlock(content);
      const buggyCode =
        extractBuggyCode(sections["buggy code"] ?? "") ||
        extractBuggyCode(content);
      if (!buggyCode) continue;

      jobs.push({
        track,
        dir,
        problemPath,
        solutionPath,
        title: fm.title,
        language: fm.language,
        contextMd,
        buggyCode,
      });
    }
  }
  return jobs;
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

function stripFirstCodeBlock(md: string): string {
  return md.replace(/```[a-zA-Z0-9_+-]*\n[\s\S]*?```/, "").trim();
}

async function regenOne(client: Anthropic, job: Job): Promise<void> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt(job.track, job.title, job.language, job.contextMd, job.buggyCode),
      },
    ],
  });

  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("no text");

  const parsed = parseResponse(textBlock.text);
  const md = buildSolutionMarkdown(
    job.language,
    job.title,
    parsed.issues,
    parsed.reference_solution,
    parsed.explanation_md,
  );
  fs.writeFileSync(job.solutionPath, md);
}

async function runPool<T>(items: T[], worker: (it: T) => Promise<void>, size: number) {
  let next = 0;
  let done = 0;
  let failed = 0;
  const total = items.length;
  async function loop() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        await worker(items[i]);
        done += 1;
      } catch (err) {
        failed += 1;
        console.error(`✗ ${(err as Error).message}`);
      }
      process.stdout.write(`\r  ${done + failed}/${total} (${failed} failed) `);
    }
  }
  await Promise.all(Array.from({ length: size }, () => loop()));
  process.stdout.write("\n");
  return { done, failed };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic();

  const jobs = listJobs();
  console.log(
    `Regenerating ${jobs.length} solution(s) across ${new Set(jobs.map((j) => j.track)).size} track(s) using ${MODEL}.\n`,
  );

  const { done, failed } = await runPool(
    jobs,
    async (job) => {
      try {
        await regenOne(client, job);
        console.log(`  ✓ ${job.track}/${path.basename(job.dir)}`);
      } catch (err) {
        console.log(`  ✗ ${job.track}/${path.basename(job.dir)} — ${(err as Error).message}`);
        throw err;
      }
    },
    CONCURRENCY,
  );

  console.log(`\nRegenerated ${done}/${jobs.length}. ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
