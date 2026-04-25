## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Delete-All Skips Dependent Callbacks
# ------------------------------------------------------------------------

class ProjectArchiver
  def self.call(project_id)
    project = Project.find(project_id)

    # CHANGE 1: Removed explicit delete_all calls on child associations — delete_all skips all ActiveRecord callbacks (including the after_destroy that deletes S3 files). Let dependent: :destroy on the model handle child destruction so every callback fires correctly.
    # CHANGE 2: Wrapped the single destroy call in a transaction so that if anything inside the destroy chain raises, the entire operation rolls back atomically and we never end up with a partially deleted project.
    ActiveRecord::Base.transaction do
      project.destroy!
    end
  end
end
```

## Explanation

### Issue 1: `delete_all` Bypasses ActiveRecord Callbacks

**Problem:** After a project is archived, `Attachment` rows are gone from the database but the corresponding S3 objects remain. Storage costs grow because the `after_destroy` callback that calls the S3 deletion service never executes.

**Fix:** Remove the three `delete_all` calls (`project.tasks.delete_all`, `project.comments.delete_all`, `project.attachments.delete_all`) entirely. The `dependent: :destroy` declarations on `Project` already instruct ActiveRecord to destroy each child record individually when `project.destroy!` is called, so every `after_destroy` callback fires.

**Explanation:** `delete_all` translates directly to a single `DELETE FROM attachments WHERE project_id = ?` SQL statement. ActiveRecord never instantiates the individual records, so no Ruby-level callbacks run — not `before_destroy`, not `after_destroy`, nothing. `destroy` (and `dependent: :destroy`) works differently: ActiveRecord loads each record, calls its full callback chain, then issues the DELETE. Because the `Attachment` model's `after_destroy` fires an S3 deletion, you need the destroy path. The same silent-skip applies to `Task` and `Comment` — any callbacks there are also silently skipped by `delete_all`. A related pitfall: `delete_all` on a `has_many :through` association also skips the join-table cleanup callbacks, which can leave join rows dangling.

---

### Issue 2: No Transaction Wrapping the Destroy Operation

**Problem:** If `project.destroy` raises partway through destroying child records — for example, a database constraint violation on one of the child tables — some children may already be deleted while the project row and others remain. The data ends up in an inconsistent state with no automatic rollback.

**Fix:** Wrap `project.destroy!` in an explicit `ActiveRecord::Base.transaction` block (CHANGE 2). Also switch to `destroy!` (bang form) so any failure raises an exception that triggers the transaction rollback instead of returning `false` silently.

**Explanation:** `project.destroy` (without the transaction wrapper) does run each child's destroy inside individual statements, but if an exception is raised mid-chain the earlier deletes are already committed. By wrapping in a transaction, any unhandled exception causes the entire set of DELETEs to roll back, leaving the database in its original state. Using `destroy!` instead of `destroy` is important here: `destroy` returns `false` on failure, which does not raise and therefore does not trigger a rollback. `destroy!` raises `ActiveRecord::RecordNotDestroyed` on failure, which the transaction catches and rolls back. A related consideration: if your S3 deletion callback fires inside the transaction and succeeds, but the database transaction rolls back afterward, the S3 objects are already deleted — so external side-effects in callbacks should ideally be deferred to an `after_commit` hook rather than `after_destroy` to avoid that mismatch.
