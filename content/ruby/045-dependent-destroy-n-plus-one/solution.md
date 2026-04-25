## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — dependent: destroy Triggers N+1
# ------------------------------------------------------------------------

class Project < ApplicationRecord
  # CHANGE 1: Remove dependent: :destroy from the association — we handle destruction manually in a batched, transactional way so Rails does not issue one DELETE per Task.
  has_many :tasks

  # CHANGE 2: Wrap the entire destruction sequence in a transaction so a timeout or error cannot leave tasks deleted but the project intact (or vice versa).
  # CHANGE 3: Batch-load tasks and invoke each callback explicitly, then delete all in one query per batch instead of one query per record.
  def destroy_with_callbacks
    transaction do
      tasks.find_in_batches(batch_size: 500) do |batch|
        batch.each(&:notify_subscribers)
        Task.where(id: batch.map(&:id)).delete_all
      end
      destroy
    end
  end
end

class Task < ApplicationRecord
  belongs_to :project

  before_destroy :notify_subscribers

  # CHANGE 3: Make notify_subscribers public so Project#destroy_with_callbacks can call it directly on batch members without going through the destroy lifecycle.
  def notify_subscribers
    SubscriberNotifier.call(task: self)
  end
end

class Admin::ProjectsController < ApplicationController
  def destroy
    @project = Project.find(params[:id])
    # CHANGE 2 & 3: Call destroy_with_callbacks instead of destroy so the transactional, batched path is used.
    @project.destroy_with_callbacks
    redirect_to admin_projects_path, notice: "Project deleted."
  end
end
```

## Explanation

### Issue 1: N+1 DELETE queries per Task

**Problem:** When `@project.destroy` is called with `dependent: :destroy`, ActiveRecord loads every associated `Task` record into memory one at a time and calls `destroy` on each, producing one `SELECT` to load IDs and then one `DELETE` for each task. With 4 000 tasks that is 4 001 sequential queries, which saturates the connection pool and causes the 47-second timeout.

**Fix:** `dependent: :destroy` is removed from the `has_many :tasks` association. A new `destroy_with_callbacks` method on `Project` uses `find_in_batches` to load 500 tasks at a time, calls `notify_subscribers` on each, then issues a single `Task.where(id: ...).delete_all` for the entire batch.

**Explanation:** `dependent: :destroy` is implemented inside ActiveRecord's `HasManyAssociation` by iterating the collection and calling `record.destroy` — there is no bulk path. Replacing it with explicit batching means the callback still fires for every record (satisfying the business requirement), but the actual SQL deletes are batched: 4 000 tasks become 8 batch deletions of 500 rows each instead of 4 000 single-row deletes. The batch size of 500 is a tunable constant; too large and you hold a big array in memory, too small and you increase round-trip overhead. The key trade-off is that `delete_all` skips ActiveRecord callbacks on the SQL side, which is intentional here because we already called `notify_subscribers` manually before issuing it.

---

### Issue 2: No transaction wrapping destroy sequence

**Problem:** The original `@project.destroy` call lets ActiveRecord handle `dependent: :destroy` sequentially without an explicit outer transaction. If the process times out or the database raises an error after some tasks are deleted but before the project row is removed, the project row survives while its tasks are gone — a broken foreign-key state that is hard to detect and harder to repair.

**Fix:** `destroy_with_callbacks` wraps the entire batch loop and the final `destroy` call inside a `transaction` block. If any step raises, the whole operation rolls back.

**Explanation:** ActiveRecord wraps each individual `record.destroy` in its own transaction, but that only protects the single row. There is no implicit transaction around a `dependent: :destroy` chain. By adding an explicit `transaction do` block that covers all batch deletions and the parent `destroy`, the database treats the entire operation as atomic — either everything commits or nothing does. The timeout scenario from production would now trigger a rollback instead of leaving partial data. One related pitfall: if `SubscriberNotifier.call` makes an external HTTP request inside the transaction, the database connection is held open for the duration of those network calls, which can exhaust the connection pool. In that case you should collect the tasks to notify, commit the transaction, and then fire the notifications — but that requires accepting the risk of a notification succeeding after a rollback, so the right choice depends on your consistency requirements.

---

### Issue 3: Callbacks invoked via destroy lifecycle, incompatible with bulk delete

**Problem:** The `before_destroy` callback on `Task` is the reason `dependent: :delete_all` was rejected — `delete_all` skips all callbacks. But leaving `before_destroy` as the only invocation path forces the code to go through the slow per-record `destroy` lifecycle.

**Fix:** `notify_subscribers` is changed from `private` to public. `destroy_with_callbacks` calls it directly on each batch member before issuing `delete_all`, so the callback logic runs without requiring the full `destroy` lifecycle for every record.

**Explanation:** `before_destroy` is a hook on the `destroy` method's lifecycle. When you call `record.destroy`, ActiveRecord runs validations, fires before/after callbacks, and issues a single-row DELETE — there is no way to separate the callback execution from the single-row delete in the standard lifecycle. Making `notify_subscribers` a plain public method breaks that coupling: the `Project` model can iterate batch members and call `task.notify_subscribers` explicitly, then issue one `delete_all` for the whole batch. The `before_destroy` callback on `Task` remains in place for cases where a single `Task` is destroyed on its own (e.g., removing one task from a project), so existing behavior is preserved. If future engineers add more `before_destroy` callbacks to `Task`, they must also add corresponding calls inside `destroy_with_callbacks` — that is a documentation/convention concern worth adding to the model's comments.
