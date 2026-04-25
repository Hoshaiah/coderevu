---
slug: use-state-object-partial-update
track: javascript
orderIndex: 63
title: Object State Loses Other Fields
difficulty: easy
tags:
  - state
  - react
  - hooks
language: typescript
---

## Context

This component is in `src/components/UserProfileForm.tsx`. It manages a form with three fields: `name`, `email`, and `bio`. Each field has its own `onChange` handler that updates the corresponding property in a single state object to keep the form data in one place.

Users report that when they type in any one field, the other two fields clear instantly. For example, filling in the `name` field and then moving to `email` causes the `name` value to disappear. The form is effectively unusable for multi-field entry.

A developer added a `console.log(formData)` inside the component and confirmed the state object only ever has one key set at a time. The component was recently refactored from three separate `useState` calls into a single combined object to simplify the submit handler.

## Buggy code

```typescript
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
      setFormData({ [field]: e.target.value } as FormData);
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
