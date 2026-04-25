## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Soft Delete Skips Dependent Callbacks
# ------------------------------------------------------------------------

# app/models/organization.rb
class Organization < ApplicationRecord
  include Discard::Model

  # CHANGE 1: Removed `dependent: :destroy` — discard does not trigger ActiveRecord dependent callbacks, so this declaration was silently doing nothing when `discard` was called. Cascade is handled manually in after_discard instead.
  has_many :projects

  after_discard :discard_projects
  after_discard :notify_billing_api

  private

  # CHANGE 2: Added `discard_projects` to explicitly discard each child project inside after_discard, ensuring Project callbacks (after_discard, and transitively s3_files cleanup) actually fire.
  def discard_projects
    projects.each(&:discard)
  end

  def notify_billing_api
    BillingApi.cancel_subscription(self.id)
  end
end

# app/models/project.rb
class Project < ApplicationRecord
  include Discard::Model

  has_many :s3_files, dependent: :destroy

  # CHANGE 3: Changed `after_destroy` to `after_discard` so the S3 archival callback fires when a project is soft-deleted via `discard`, not only when it is hard-destroyed.
  after_discard :archive_s3_files

  private

  def archive_s3_files
    S3Archiver.archive!(self.id)
  end
end

# app/controllers/organizations_controller.rb
class OrganizationsController < ApplicationController
  def destroy
    org = Organization.find(params[:id])
    org.discard
    redirect_to organizations_path, notice: "Organization deleted"
  end
end
```

## Explanation

### Issue 1: `discard` bypasses `dependent: :destroy`

**Problem:** When `org.discard` is called, ActiveRecord's `dependent: :destroy` machinery never runs. `dependent: :destroy` only activates when ActiveRecord's own `destroy` method is invoked on the parent. The `discard` gem updates `deleted_at` via a direct SQL `UPDATE`, so associated `Project` rows are left completely untouched.

**Fix:** Remove `dependent: :destroy` from the `has_many :projects` declaration in `Organization` (CHANGE 1), and add a new `after_discard :discard_projects` callback (CHANGE 2) that iterates over projects and calls `discard` on each one explicitly.

**Explanation:** The `discard` gem works by setting a timestamp column in a plain SQL update. It does not go through the ActiveRecord lifecycle that triggers `before_destroy`, `after_destroy`, or dependent association teardown. Because of this, the `dependent: :destroy` option on `has_many :projects` appears correct in the model but silently does nothing when the soft-delete path is taken. Manually calling `projects.each(&:discard)` inside `after_discard` ensures the same cascade happens through the discard lifecycle. One pitfall to keep in mind: if you later add hard-delete support and restore `dependent: :destroy`, you will have both paths active, so you should guard with an `undiscarded` scope or remove the manual cascade accordingly.

---

### Issue 2: `after_destroy` on `Project` never fires during soft delete

**Problem:** `Project#archive_s3_files` is registered on `after_destroy`, but projects are never hard-destroyed in this flow — they are supposed to be soft-deleted. Because the destroy callback never runs, `S3Archiver.archive!` is never called, S3 files accumulate, and storage costs grow silently.

**Fix:** Change `after_destroy :archive_s3_files` to `after_discard :archive_s3_files` in `Project` (CHANGE 3), so the archival logic runs whenever a project is discarded.

**Explanation:** `after_destroy` hooks into ActiveRecord's `destroy` call. The moment the team switched to soft deletion, any callback registered on `after_destroy` became unreachable through the normal delete flow. Switching to `after_discard` aligns the callback with the actual lifecycle event being triggered. Note that `s3_files` still uses `has_many :s3_files, dependent: :destroy` — that remains correct only if you intend to hard-delete the `S3File` database rows immediately; if `S3File` is also a discardable model you would need the same cascade pattern applied there.

---

### Issue 3: Child projects never receive a `deleted_at` timestamp

**Problem:** Even if archival and billing callbacks were somehow triggered, the `projects` rows in the database retain `deleted_at = NULL`. Any query that uses the default `kept` scope from `Discard::Model` will continue to return these projects as active, so they show up in tenant views and counts even though the parent organization is gone.

**Fix:** The `discard_projects` method added at CHANGE 2 calls `project.discard` on each child, which sets `deleted_at` on every project row and also causes each project's own `after_discard` callbacks (including `archive_s3_files` from CHANGE 3) to run.

**Explanation:** Soft deletion requires every model in the cascade to be explicitly discarded if you want their `deleted_at` columns populated. Nothing automatically propagates a discard downward the association tree. By iterating with `projects.each(&:discard)` you both stamp each row and fire its callbacks in a single step. A related pitfall: if the organization has many thousands of projects, loading them all into Ruby objects for iteration may be slow; in that case you can batch with `projects.find_each(&:discard)` to avoid loading the full collection into memory at once.
