---
slug: context-value-object-recreation
track: javascript
orderIndex: 83
title: Context Value Object Recreation On Every Render
difficulty: medium
tags:
  - context
  - performance
  - referential-equality
  - useMemo
language: typescript
---

## Context

A global `ThemeProvider` wraps the entire app and exposes theme colors and a toggle function. Performance profiling shows that every component subscribed to `ThemeContext` re-renders on every keystroke in an unrelated search input, even though the theme hasn't changed.

## Buggy code

```typescript
import { createContext, useContext, useState, ReactNode } from "react";

interface Theme {
  primary: string;
  toggle: () => void;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  const toggle = () => setIsDark((d) => !d);

  return (
    <ThemeContext.Provider
      value={{
        primary: isDark ? "#000" : "#fff",
        toggle,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
```
