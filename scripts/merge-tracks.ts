import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const CONTENT_DIR = path.resolve(process.cwd(), "content");

type Merge = {
  from: string; // e.g. "rails"
  to: string; // e.g. "ruby"
};

const MERGES: Merge[] = [
  { from: "rails", to: "ruby" },
  { from: "react", to: "javascript" },
];

function nextOrderIndex(toDir: string): number {
  if (!fs.existsSync(toDir)) return 1;
  const indices = fs
    .readdirSync(toDir)
    .filter((d) => fs.statSync(path.join(toDir, d)).isDirectory())
    .map((d) => parseInt(d.split("-")[0], 10))
    .filter((n) => Number.isFinite(n));
  return (indices.length === 0 ? 0 : Math.max(...indices)) + 1;
}

function mergeOne(merge: Merge) {
  const fromDir = path.join(CONTENT_DIR, merge.from);
  const toDir = path.join(CONTENT_DIR, merge.to);
  if (!fs.existsSync(fromDir)) {
    console.log(`[${merge.from}] source missing, skipping`);
    return;
  }
  if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });

  const entries = fs
    .readdirSync(fromDir)
    .filter((d) => fs.statSync(path.join(fromDir, d)).isDirectory())
    .sort();

  let nextIdx = nextOrderIndex(toDir);
  for (const entry of entries) {
    const srcDir = path.join(fromDir, entry);
    const slug = entry.replace(/^\d+-/, "");
    const newDirName = `${String(nextIdx).padStart(3, "0")}-${slug}`;
    const destDir = path.join(toDir, newDirName);

    if (fs.existsSync(destDir)) {
      console.warn(`  skip ${srcDir} → ${destDir} (destination exists)`);
      continue;
    }

    fs.mkdirSync(destDir, { recursive: true });

    const problemPath = path.join(srcDir, "problem.md");
    const solutionPath = path.join(srcDir, "solution.md");
    if (fs.existsSync(problemPath)) {
      const raw = fs.readFileSync(problemPath, "utf8");
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, unknown>;
      fm.track = merge.to;
      fm.orderIndex = nextIdx;
      const rewritten = matter.stringify(parsed.content, fm);
      fs.writeFileSync(path.join(destDir, "problem.md"), rewritten);
    }
    if (fs.existsSync(solutionPath)) {
      fs.copyFileSync(solutionPath, path.join(destDir, "solution.md"));
    }
    console.log(`  ✓ ${merge.from}/${entry} → ${merge.to}/${newDirName}`);
    nextIdx += 1;
  }

  // Remove source track dir once everything's copied.
  fs.rmSync(fromDir, { recursive: true, force: true });
  console.log(`[${merge.from}] removed source dir`);
}

for (const m of MERGES) mergeOne(m);
