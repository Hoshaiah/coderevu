## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — N+1 on Nested Includes
# ------------------------------------------------------------------------

class Api::V1::ProjectsController < ApplicationController
  def index
    # CHANGE 1: Added `tasks: :assignee` so ActiveRecord issues one JOIN/preload query for assignees instead of one query per task.
    projects = Project
      .where(account_id: current_account.id)
      .includes(tasks: :assignee)
      .order(created_at: :desc)

    render json: projects.map { |project|
      {
        id: project.id,
        name: project.name,
        tasks: project.tasks.map { |task|
          {
            id: task.id,
            title: task.title,
            # CHANGE 2: `task.assignee` is now loaded from the in-memory association cache rather than triggering a database query, so `&.name` reads from the preloaded User object.
            assignee: task.assignee&.name
          }
        }
      }
    }
  end
end
```

## Explanation

### Issue 1: Nested association not eager-loaded

**Problem:** The endpoint fires one `SELECT * FROM users WHERE id = ?` for every task across every project. A customer with 200 projects and an average of 10 tasks each triggers ~2,000 user queries per request, which is what New Relic surfaces as the bottleneck.

**Fix:** Replace `.includes(:tasks)` with `.includes(tasks: :assignee)` at the query-building site. This tells ActiveRecord to preload the `assignee` (User) records belonging to each task in a second batch query rather than lazily fetching them on demand.

**Explanation:** Rails `includes` only goes one level deep unless you nest the hash. When you write `includes(:tasks)`, ActiveRecord preloads all tasks for the fetched projects in one query, but it knows nothing about each task's `assignee` association. The moment the view calls `task.assignee`, ActiveRecord sees an unloaded `belongs_to` and issues a fresh `SELECT` against the `users` table. With `includes(tasks: :assignee)`, ActiveRecord issues a third batch query (or a JOIN, depending on the data shape) that loads all referenced users at once and populates the in-memory association cache. Subsequent calls to `task.assignee` read from that cache, producing zero additional SQL. A related pitfall: if you ever add another nested association (e.g., `task.comments`) you must extend the hash further — `includes(tasks: [:assignee, :comments])` — otherwise the same pattern recurs for the new association.

---

### Issue 2: Safe-navigator operates on a potentially unloaded association

**Problem:** Even though `&.name` prevents a `NoMethodError` when `assignee_id` is `nil`, before the fix `task.assignee` still fires a database query for every task that does have an assignee, because the association is not in the cache. The `&.` only guards against nil; it does not guard against a database round-trip.

**Fix:** With `includes(tasks: :assignee)` in place (CHANGE 1), the call `task.assignee&.name` at the serialization site now reads entirely from the preloaded cache. No change to the `&.` syntax is needed; the fix is that the association is now warm before this line executes.

**Explanation:** `belongs_to :assignee` works by calling `User.find(assignee_id)` the first time the association is accessed if it has not been loaded. The `&.` safe-navigator short-circuits to `nil` only when `task.assignee` returns `nil` — but to determine that, ActiveRecord must still execute the query when the association is unloaded and `assignee_id` is present. After eager-loading, `task.association(:assignee).loaded?` is `true`, so `task.assignee` returns the cached object (or `nil` for tasks with no `assignee_id`) without touching the database. The practical result is that `task.assignee&.name` becomes a pure Ruby attribute read, and the query count drops from O(tasks) to O(1) additional queries regardless of dataset size.
