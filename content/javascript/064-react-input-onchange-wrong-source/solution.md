## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Controlled Input Updates Wrong Field
// ------------------------------------------------------------------------

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
        // CHANGE 1: pass setEmail (not setPassword) so typing here updates the email field, not the password field
        onChange={handleChange(setEmail)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        // CHANGE 2: pass setPassword (not setEmail) so typing here updates the password field, not the email field
        onChange={handleChange(setPassword)}
        placeholder="Password"
      />
      <button type="submit">Log in</button>
    </form>
  );
}
```

## Explanation

### Issue 1: Email input updates wrong state

**Problem:** When a user types into the email field, the value appears in the password field instead, and the email field stays empty. This is because `onChange={handleChange(setPassword)}` is wired to the email `<input>`, so every keystroke calls `setPassword`, leaving `email` unchanged and making both fields display the password state value.

**Fix:** Replace `handleChange(setPassword)` with `handleChange(setEmail)` on the email `<input>` (the `CHANGE 1` line).

**Explanation:** `handleChange` is a factory — it takes a setter and returns an event handler that calls that setter with the current input value. Passing the wrong setter means the correct state variable is never written. Because the email `<input>` is a controlled component bound to `value={email}`, and `email` never changes, the field appears frozen while `password` absorbs all keystrokes. The fix pairs each input with its own state setter so state updates flow to the right variable.

---

### Issue 2: Password input updates wrong state

**Problem:** When a user types into the password field, the value appears in the email field instead. `onChange={handleChange(setEmail)}` is wired to the password `<input>`, so every keystroke updates `email` rather than `password`, mirroring the same cross-wiring in the opposite direction.

**Fix:** Replace `handleChange(setEmail)` with `handleChange(setPassword)` on the password `<input>` (the `CHANGE 2` line).

**Explanation:** The two bugs are symmetric: each input received the other input's setter. Because both fields are controlled components, React re-renders after every state change and sets each field's displayed value from its bound state variable. With the setters swapped, the two fields effectively share a single piece of state (whichever one was last updated), making them mirror each other. Fixing both call sites so each input owns its corresponding setter restores independent, correct state management for each field.
