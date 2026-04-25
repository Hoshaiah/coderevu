---
slug: react-input-onchange-wrong-source
track: javascript
orderIndex: 64
title: Controlled Input Updates Wrong Field
difficulty: easy
tags:
  - state
  - react
  - closures
language: typescript
---

## Context

This component lives in `src/components/LoginForm.tsx` and renders a simple email/password login form. It is a controlled component — both fields are tied to React state and updated via `onChange` handlers.

Users complain that typing in the password field also changes the email field, and vice versa. Both inputs seem to mirror each other. QA confirms that both fields display the same value after typing in either one.

The developer recently refactored the form to reduce repetition by extracting a shared `handleChange` function, and the bug appeared after that change.

## Buggy code

```typescript
import { useState } from 'react';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleChange = (setter: (v: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.currentTarget.value);
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log({ email, password });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={handleChange(setPassword)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={handleChange(setEmail)}
        placeholder="Password"
      />
      <button type="submit">Log in</button>
    </form>
  );
}
```
