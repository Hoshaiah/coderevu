---
slug: forward-ref-missing
track: javascript
orderIndex: 99
title: TextInput Component Missing forwardRef
difficulty: medium
tags:
  - refs
  - forwardRef
  - component-api
  - DOM
language: typescript
---

## Context

The design system exposes a `TextInput` wrapper around `<input>`. A form page holds a ref to `TextInput` and calls `inputRef.current.focus()` when a validation error occurs. The focus call silently does nothing — `inputRef.current` is the component instance (null for function components), not the underlying DOM node.

## Buggy code

```typescript
import { useRef } from "react";

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function TextInput({ label, value, onChange }: TextInputProps) {
  return (
    <label>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function SignupForm() {
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    inputRef.current?.focus();
  };

  return (
    <div>
      <TextInput
        ref={inputRef}
        label="Email"
        value=""
        onChange={() => {}}
      />
      <button onClick={validate}>Submit</button>
    </div>
  );
}
```
