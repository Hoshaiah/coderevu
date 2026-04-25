## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — List items without stable keys cause incorrect DOM reconciliation during reordering
// ------------------------------------------------------------------------
import { useState } from "react";

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

  const sort = () =>
    setTasks((prev) => [...prev].sort((a, b) => a.label.localeCompare(b.label)));

  // CHANGE 2: track input edits in state so each task's value is controlled
  const [inputValues, setInputValues] = useState<Record<number, string>>(
    () => ({
      1: "Buy groceries",
      2: "Walk the dog",
      3: "Write tests",
    })
  );

  return (
    <div>
      <button onClick={sort}>Sort A\u2013Z</button>
      <ul>
        {tasks.map((task) => (
          // CHANGE 1: use task.id as key so React tracks each item by identity, not by position, and correctly moves DOM nodes during reordering
          <li key={task.id}>
            {/* CHANGE 2: use controlled `value` + `onChange` so the displayed
                text is always driven by state, not the initial DOM value */}
            <input
              value={inputValues[task.id] ?? task.label}
              onChange={(e) =>
                setInputValues((prev) => ({
                  ...prev,
                  [task.id]: e.target.value,
                }))
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Explanation

### Issue 1: Index-based key breaks DOM reordering

**Problem:** When the list is sorted, React sees the same keys (0, 1, 2) at the same positions and concludes that nothing moved — it just updates the props of each existing DOM node in place. The browser's native input focus stays attached to the physical `<input>` element that was at position 0, which is now displaying a different task after the sort.

**Fix:** Replace `key={index}` with `key={task.id}` at the `<li>` element. `task.id` is a stable, unique identifier that travels with the task object across re-renders.

**Explanation:** React's reconciler uses the `key` prop to decide whether two renders of a list element represent the same conceptual item. When keys are array indices, swapping two items in the data array produces identical keys at each position, so React patches the existing DOM nodes rather than moving them. Using a stable `id` tells React that item 1 is item 1 regardless of where it appears in the array, so the reconciler reorders the actual DOM nodes (and their associated focus state) to match. A related pitfall: if you generate keys with `Math.random()` on every render you get the opposite problem — React unmounts and remounts every node on each render, destroying all input state.

---

### Issue 2: Uncontrolled input retains stale displayed value

**Problem:** `defaultValue` only sets the DOM input's value on the initial mount. After that, the DOM owns the value. When React reorders the DOM nodes (once Issue 1 is fixed), the text in each input still reflects whatever the user typed or the original seed value from mount — it does not re-read from the `task.label` prop — so the displayed text can be wrong after sorting.

**Fix:** Replace `defaultValue={task.label}` with a controlled pattern: `value={inputValues[task.id]}` driven by a `Record<number, string>` state object, plus an `onChange` handler that updates that state by `task.id`.

**Explanation:** A `defaultValue` input is "uncontrolled" — React writes the value once at mount and then hands ownership to the browser. React cannot push new values into it on subsequent renders. A controlled input (`value` + `onChange`) keeps the displayed text in sync with React state on every render, so when the list reorders and a different `task.id` ends up at a given position, the input immediately shows the correct stored value for that id. Keying the stored values by `task.id` (not by index) means each task carries its own edited text through sorts. The tradeoff is that you must initialize the state to match the initial task labels, which the `useState` initializer function handles here.
