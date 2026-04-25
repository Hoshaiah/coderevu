---
slug: localstorage-json-parse-xss-eval
track: javascript
orderIndex: 81
title: Stored XSS via JSON.parse Reviver
difficulty: hard
tags:
  - security
  - xss
  - correctness
language: typescript
---

## Context

This module lives in `src/utils/settingsStorage.ts` in a dashboard SaaS app. It persists user UI settings (column order, theme, custom labels) to `localStorage` and rehydrates them on startup. Settings can be exported and imported by users as JSON files, which are then stored via this same module.

The security team flagged that a malicious settings file distributed via a phishing link can achieve stored XSS in the application. The bug is subtle: linting passes, TypeScript compiles cleanly, and the code looks like ordinary JSON parsing.

The team already confirmed that the import UI uses `FileReader` and never calls `eval` explicitly. They focused their review on the network layer and DOMPurify usage in the rendering components, but the vulnerability is in this storage module.

## Buggy code

```typescript
interface Settings {
  theme: 'light' | 'dark';
  columnOrder: string[];
  customLabels: Record<string, string>;
}

const SETTINGS_KEY = 'app_settings';

function deserializeValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith('fn:')) {
    // Support for serialized formatter functions stored by power users
    // eslint-disable-next-line no-new-func
    return new Function('return (' + value.slice(3) + ')')();
  }
  return value;
}

export function loadSettings(): Settings | null {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw, deserializeValue) as Settings;
  } catch {
    return null;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
```
