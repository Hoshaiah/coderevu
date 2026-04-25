import fs from "node:fs";
import path from "node:path";

import { TRACK_IDS } from "../lib/db/types";

const CONTENT_DIR = path.resolve(process.cwd(), "content");

// Matches the legacy header block:
//   <prefix> Issues:
//   <prefix>
//   <prefix> 1. ...
//   <prefix> 2. ...
//   ...
//   <prefix>
//   <prefix> Fixed version:
//   [blank line]
// and strips it entirely, leaving the ANSWER divider lines intact.
function stripIssuesBlock(content: string): { next: string; changed: boolean } {
  const patterns = [
    // hash-comment languages (python, ruby)
    /(^#\s*\n)?^#\s*Issues:\s*\n(^#.*\n)+?^#\s*Fixed version:\s*\n(\s*\n)?/m,
    // slash-comment languages (everything else)
    /(^\/\/\s*\n)?^\/\/\s*Issues:\s*\n(^\/\/.*\n)+?^\/\/\s*Fixed version:\s*\n(\s*\n)?/m,
  ];
  let next = content;
  let changed = false;
  for (const re of patterns) {
    const replaced = next.replace(re, "");
    if (replaced !== next) {
      changed = true;
      next = replaced;
    }
  }
  return { next, changed };
}

function main() {
  let scanned = 0;
  let modified = 0;
  for (const track of TRACK_IDS) {
    const trackDir = path.join(CONTENT_DIR, track);
    if (!fs.existsSync(trackDir)) continue;
    for (const entry of fs.readdirSync(trackDir)) {
      const dir = path.join(trackDir, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      const solutionPath = path.join(dir, "solution.md");
      if (!fs.existsSync(solutionPath)) continue;
      scanned += 1;
      const raw = fs.readFileSync(solutionPath, "utf8");
      const { next, changed } = stripIssuesBlock(raw);
      if (!changed) continue;
      fs.writeFileSync(solutionPath, next);
      modified += 1;
      console.log(`✓ ${track}/${entry}`);
    }
  }
  console.log(`\nScanned ${scanned}, modified ${modified}.`);
}

main();
