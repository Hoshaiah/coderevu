---
slug: react-state-mutation
track: javascript
orderIndex: 61
title: Direct State Array Mutation
difficulty: easy
tags:
  - state
  - react
  - immutability
language: typescript
---

## Context

This component is in `src/components/TaskList.tsx`, a simple to-do list that lets users add and delete tasks. It is a controlled component; the task list lives in local state and is rendered directly.

Users report that deleting a task appears to do nothing on the first click. Clicking the delete button a second time (or performing any other action that triggers a re-render) correctly removes the item. The bug is 100% reproducible.

The developer has already ruled out the click handler not firing — they added a `console.log` confirming the correct index is logged on the first click. They also confirmed the filtered array has the right length inside the handler.

## Buggy code

```typescript
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
    // Remove the task with the given id
    const updated = tasks;
    const index = updated.findIndex((t) => t.id === id);
    updated.splice(index, 1);
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
