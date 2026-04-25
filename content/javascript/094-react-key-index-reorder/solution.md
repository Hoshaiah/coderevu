## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Array Index Used as List Key
// ------------------------------------------------------------------------

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
      {todos.map((todo) => (
        <TodoItem
          // CHANGE 1: Use todo.id as key instead of array index so React matches each mounted TodoItem instance to the correct todo even after deletions or prepends, preventing stale local state from leaking into the wrong item.
          key={todo.id}
          label={todo.label}
          onRemove={() => remove(todo.id)}
        />
      ))}
    </div>
  );
}
```

## Explanation

### Issue 1: Array index used as list key

**Problem:** After deleting any item that is not the last one, the text shown in the remaining inputs shifts. For example, deleting the first todo makes the second input display the text that belonged to the first. The `todos` array in state is correct, but what users see on screen is wrong.

**Fix:** Replace `key={index}` with `key={todo.id}` on the `TodoItem` element inside the `todos.map` call.

**Explanation:** React uses the `key` prop to decide which existing component instance corresponds to which item in the new render. When the key is the array index, deleting index 0 causes what was index 1 to become index 0, so React hands the component instance that was rendering "Buy groceries" a new `label` prop of "Walk the dog" — but it keeps the same mounted instance. Because `TodoItem` copies `props.label` into its own `useState` only on mount (`useState(props.label)` runs once), the input still holds the old local state string while the new label prop is ignored. Switching to `key={todo.id}` gives each todo a stable identity: when a todo is deleted, its component unmounts and the remaining components keep their own state. When a new todo is prepended, it gets a fresh mount with the correct empty label, and all existing instances are undisturbed.

---

### Issue 2: Child local state not re-synced when key is stable but position changes

**Problem:** Even when using a stable `key`, if the same component instance ends up in a different visual position due to a re-order or if an upstream bug provides the wrong key, the child's controlled input value (held in its own `useState`) will not update because `props.label` changes are silently ignored after mount.

**Fix:** This issue is fully resolved as a side-effect of CHANGE 1: once `key={todo.id}` is in place, each `TodoItem` instance is always paired with its own todo and never receives a `label` prop meant for a different item, so the mismatch between local state and incoming props cannot occur during normal delete or prepend operations.

**Explanation:** `TodoItem` does `const [value, setValue] = useState(props.label)` — the initial state is set from `props.label` at mount time and never again. This is an intentional design choice for uncontrolled-ish inputs, but it means the component is fragile: if React reuses the same instance for a different todo (which happens when keys are indices), the input value drifts from the underlying data. With stable id-based keys, React unmounts the old instance and mounts a fresh one whenever the todo identity changes, so `useState(props.label)` always runs with the right initial value. A related pitfall: if you later add reordering (e.g., drag-and-drop) and forget that `TodoItem` ignores prop updates, inputs will again show stale text — the fix there would be to add a `useEffect` that calls `setValue(props.label)` when `props.label` changes, or to lift the edit state up to the parent.
