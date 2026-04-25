---
slug: missing-key-prop-list
track: javascript
orderIndex: 98
title: Missing Key Prop Causes DOM Reconciliation Bug
difficulty: easy
tags:
  - reconciliation
  - keys
  - lists
  - performance
language: typescript
---

## Context

A task manager renders a sortable list of to-do items. When users click "Sort A–Z", the list reorders but input field focus jumps to the wrong item, and occasionally text typed in one field appears in a different row after sorting.

## Buggy code

```typescript
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

  return (
    <div>
      <button onClick={sort}>Sort A–Z</button>
      <ul>
        {tasks.map((task, index) => (
          <li key={index}>
            <input defaultValue={task.label} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```
