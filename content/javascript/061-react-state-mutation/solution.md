## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Direct State Array Mutation
// ------------------------------------------------------------------------

import React, { useState } from "react";

interface Task {
  id: number;
  label: string;
}

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, label: "Buy groceries" },
    { id: 2, label: "Walk the dog" },
    { id: 3, label: "Write tests" },
  ]);

  function handleDelete(id: number) {
    // CHANGE 1: Use filter() to produce a new array instead of mutating the existing state array with splice(); React compares references and will not re-render when the same array object is passed to setTasks.
    // CHANGE 2: filter() naturally skips unknown ids without the splice(-1,1) risk that would occur if findIndex returned -1.
    const updated = tasks.filter((t) => t.id !== id);
    setTasks(updated);
  }

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>
          {task.label}
          <button onClick={() => handleDelete(task.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

## Explanation

### Issue 1: State Array Mutated Directly

**Problem:** Clicking Delete appears to do nothing the first time. The task only disappears after a second click or some other action forces a re-render. The task list in the DOM is stale despite the handler running correctly.

**Fix:** Replace the `const updated = tasks` / `updated.splice(index, 1)` / `setTasks(updated)` block with a single `const updated = tasks.filter((t) => t.id !== id)` followed by `setTasks(updated)`. `filter()` returns a brand-new array; `splice()` is removed entirely.

**Explanation:** `const updated = tasks` does not copy the array — it copies the reference, so `updated` and `tasks` point to the same object in memory. When `splice()` removes the element, it modifies that shared object in place. Then `setTasks(updated)` hands React the exact same array reference it already holds. React's state update logic performs a shallow comparison of the old and new state values; because the reference is identical it bails out and skips the re-render. The DOM therefore does not update. On the next render triggered by any other cause, `tasks` now reflects the mutated array (the splice did run), so the item appears gone — which is the "second click fixes it" symptom. Using `filter()` produces a new array object, so React sees a different reference, schedules a re-render, and the UI updates immediately. A related pitfall: never use `push`, `pop`, `sort`, or `reverse` on a state array for the same reason.

---

### Issue 2: Unguarded findIndex Can Silently Remove Wrong Element

**Problem:** If `handleDelete` is ever called with an `id` that does not exist in the array, `findIndex` returns `-1`. Passing `-1` to `splice(-1, 1)` removes the last element of the array — a silent data-loss bug with no error thrown.

**Fix:** The `findIndex` / `splice` approach is replaced entirely by `tasks.filter((t) => t.id !== id)`. The `findIndex` call and the `-1` risk are removed from the code.

**Explanation:** `Array.prototype.splice` treats a negative first argument as an offset from the end of the array, so `splice(-1, 1)` deletes the last item. In this component the ids are controlled and the buttons are rendered from state, so passing an unknown id is unlikely in normal use. However, if the component ever receives ids from an external source (URL params, websocket events, etc.) or if there is a race condition where the task was already deleted, the unguarded path would corrupt the list without any visible error. `filter()` sidesteps the issue entirely: if no element matches `t.id !== id` is always true for every element, the full array is returned unchanged, and nothing is deleted.
