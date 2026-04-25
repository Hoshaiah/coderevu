---
slug: array-destructure-rest-type-widening
track: javascript
orderIndex: 41
title: Rest Destructure Widens Tuple Type
difficulty: medium
tags:
  - types
  - typescript
  - destructuring
language: typescript
---

## Context

This utility lives in `src/parsers/csvRow.ts` and is responsible for splitting a raw CSV line from an import job into a typed record. The first two columns are always `id` (numeric) and `status` (one of a fixed set of strings); the rest are dynamic attribute key-value pairs.

At runtime the function crashes with `Cannot read properties of undefined` on certain rows, but TypeScript reports no errors during compilation. The CI pipeline passes, and the crash only surfaces in production when files with more than two columns are processed.

A colleague verified that the CSV file itself is valid and that `line.split(',')` returns the expected array. The suspicion is somewhere in how the parsed values are handed to downstream logic.

## Buggy code

```typescript
type Status = 'active' | 'inactive' | 'pending';

interface ParsedRow {
  id: number;
  status: Status;
  attributes: string[];
}

function parseCsvRow(line: string): ParsedRow {
  const parts = line.split(',');
  const [rawId, rawStatus, ...attributes] = parts;

  const id = Number(rawId);
  const status = rawStatus as Status;

  // Downstream code that processes each attribute pair
  const processed = attributes.map((attr, i) => {
    if (i % 2 === 0) {
      const key = attr;
      const value = attributes[i + 1].trim(); // assumes pairs
      return `${key}=${value}`;
    }
    return null;
  }).filter(Boolean);

  return { id, status, attributes: processed as string[] };
}
```
