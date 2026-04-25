---
slug: react-key-index-reorder
track: javascript
orderIndex: 94
title: Array Index Used as List Key
difficulty: easy
tags:
  - react
  - state
  - correctness
language: typescript
---

## Context

This component lives in `src/components/TodoList.tsx`. It renders a list of todo items, each of which contains a controlled text input so users can edit the item's label inline. Items can be deleted by clicking a remove button, and new items can be prepended to the top of the list.

Users report that after deleting an item that is not the last one, the text in the remaining inputs shifts: the input that was second now shows the text that was in the first, etc. Similarly, after prepending a new blank item, all existing inputs appear to show the wrong text. The underlying `todos` array in state is correct — `console.log` confirms the data is right.

The team verified that each `TodoItem` component reads its initial value from `props.label` and is otherwise an uncontrolled-ish input (it copies `props.label` into its own `useState` on mount). They have not changed that component.

## Buggy code

```typescript
import React, { useState } from 'react';
import { TodoItem } from './TodoItem';

type Todo = { id: string; label: string };

export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 'a1', label: 'Buy groceries' },
    { id: 'b2', label: 'Walk the dog' },
    { id: 'c3', label: 'Read a book' },
  ]);

  const remove = (id: string) =>
    setTodos((prev) => prev.filter((t) => t.id !== id));

  const prepend = () =>
    setTodos((prev) => [{ id: crypto.randomUUID(), label: '' }, ...prev]);

  return (
    <div>
      <button onClick={prepend}>Add item</button>
      {todos.map((todo, index) => (
        <TodoItem
          key={index}
          label={todo.label}
          onRemove={() => remove(todo.id)}
        />
      ))}
    </div>
  );
}
```
