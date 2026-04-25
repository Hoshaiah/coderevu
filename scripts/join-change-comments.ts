import fs from "node:fs";
import path from "node:path";

import { TRACK_IDS } from "../lib/db/types";

const CONTENT_DIR = path.resolve(process.cwd(), "content");

// Collapse multi-line `CHANGE N:` comments into a single long comment line.
// A CHANGE comment starts with e.g. `  # CHANGE 1: ...` or `  // CHANGE 2: ...`.
// Continuation lines are consecutive comment lines that share the same indent
// AND the same comment prefix AND do not themselves start a new `CHANGE N:`.
// We stop on the first non-comment line or any comment that starts a new
// CHANGE so unrelated comments below stay untouched.
function joinChangeComments(source: string): { next: string; changed: boolean } {
  const lines = source.split("\n");
  const out: string[] = [];
  let changed = false;

  const startRe = /^(\s*)(#|\/\/)\s*CHANGE\s+\d+:\s*(.*)$/;
  const contRe = (indent: string, prefix: string) =>
    new RegExp(`^${indent.replace(/\s/g, "\\s")}${prefix === "//" ? "\\/\\/" : "#"}\\s?(.*)$`);
  const changeStartRe = /\s*CHANGE\s+\d+:/;

  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(startRe);
    if (!m) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const [, indent, prefix, firstRest] = m;
    const cont = contRe(indent, prefix);
    const collected: string[] = [firstRest.trim()];
    let j = i + 1;
    while (j < lines.length) {
      const l = lines[j];
      const cm = l.match(cont);
      if (!cm) break; // not a comment at same indent/prefix
      const body = cm[1];
      if (changeStartRe.test(body)) break; // new CHANGE N: begins
      collected.push(body.trim());
      j += 1;
    }
    if (j > i + 1) changed = true;
    // Emit the joined comment as a single line, trimming any trailing empties.
    const joined = collected.filter((s) => s.length > 0).join(" ");
    const num = lines[i].match(/CHANGE\s+(\d+):/)?.[1] ?? "";
    out.push(`${indent}${prefix} CHANGE ${num}: ${joined}`);
    i = j;
  }

  return { next: out.join("\n"), changed };
}

// Apply the join only inside the fenced code block of the Reference solution
// section so we don't touch prose or explanations.
function processSolutionMd(md: string): { next: string; changed: boolean } {
  const fenceRe = /(```[a-zA-Z0-9_+-]*\n)([\s\S]*?)(\n```)/;
  const match = md.match(fenceRe);
  if (!match) return { next: md, changed: false };
  const [whole, openFence, code, closeFence] = match;
  const { next: joined, changed } = joinChangeComments(code);
  if (!changed) return { next: md, changed: false };
  const replaced = md.replace(whole, `${openFence}${joined}${closeFence}`);
  return { next: replaced, changed: true };
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
      const { next, changed } = processSolutionMd(raw);
      if (!changed) continue;
      fs.writeFileSync(solutionPath, next);
      modified += 1;
      console.log(`✓ ${track}/${entry}`);
    }
  }
  console.log(`\nScanned ${scanned}, modified ${modified}.`);
}

main();
