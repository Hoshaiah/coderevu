## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Object State Loses Other Fields
// ------------------------------------------------------------------------

import React, { useState } from 'react';

interface FormData {
  name: string;
  email: string;
  bio: string;
}

export function UserProfileForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    bio: '',
  });

  const handleChange = (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // CHANGE 1: Spread the existing formData into the new object so all other fields are preserved; previously only { [field]: value } was passed, wiping every other key.
      // CHANGE 2: Removed the `as FormData` cast so TypeScript can verify the object satisfies the interface rather than silently accepting an incomplete object.
      setFormData({ ...formData, [field]: e.target.value });
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting', formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={formData.name} onChange={handleChange('name')} />
      <input value={formData.email} onChange={handleChange('email')} />
      <textarea value={formData.bio} onChange={handleChange('bio')} />
      <button type="submit">Save</button>
    </form>
  );
}
```

## Explanation

### Issue 1: State object missing spread on update

**Problem:** Every time the user types a character in any field, the other two fields go blank immediately. After filling in `name` and clicking into `email`, the `name` input empties because its value is now `undefined` (rendered as empty string by the controlled input).

**Fix:** Replace `{ [field]: e.target.value } as FormData` with `{ ...formData, [field]: e.target.value }` at the `setFormData` call site. The spread copies all current key-value pairs from `formData` into the new object before overwriting only the changed field.

**Explanation:** `useState`'s setter in React does a full replacement, not a shallow merge the way `this.setState` did in class components. When `handleChange('email')` fires, `setFormData({ email: 'alice@example.com' })` throws away `name` and `bio` entirely — they are absent keys in the new object, so the state object only ever has one field at a time, which is exactly what the `console.log` showed. Spreading `formData` first means the setter receives a complete object where the updated field is overwritten and every other field keeps its current value. A related pitfall: if the handler closes over a stale `formData` snapshot (e.g., in an async context), you should use the functional form `setFormData(prev => ({ ...prev, [field]: e.target.value }))` instead, which always reads the latest state.

---

### Issue 2: Type cast hiding incomplete object

**Problem:** TypeScript should have flagged `{ [field]: e.target.value }` as not satisfying `FormData` because `name`, `email`, and `bio` are all required strings, and only one of them is present. No type error appeared in the editor or CI, so the bug was invisible at compile time.

**Fix:** Remove `as FormData` from the `setFormData` call. With the spread fix in place the object already satisfies the interface, so the cast is unnecessary and its removal restores full type checking.

**Explanation:** `as T` is a type assertion that tells the TypeScript compiler "trust me, this value is of type `T`" without actually verifying it. Here it short-circuits the check that would have caught the missing `name` and `bio` keys. Once the cast is gone and the object is a proper spread, TypeScript checks the literal normally and will surface future mistakes — for example, if someone renames a field in `FormData` but forgets to update the setter. Relying on `as` to silence type errors on object literals is a common source of hidden runtime bugs; prefer proper typing or `Partial<FormData>` if an incomplete object is genuinely intentional.
