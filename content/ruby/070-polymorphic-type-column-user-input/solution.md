## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Polymorphic Type Set from User Input
# ------------------------------------------------------------------------

class CommentsController < ApplicationController
  before_action :require_login

  ALLOWED_TYPES = %w[Article Video Podcast].freeze

  def create
    # CHANGE 1: Validate commentable_type against the whitelist before use; reject early if not allowed to prevent any unsanitized class name from reaching ActiveRecord.
    unless ALLOWED_TYPES.include?(params[:commentable_type])
      return render json: { error: "Invalid commentable type" }, status: :unprocessable_entity
    end

    # CHANGE 2: Look up the target record through the whitelisted constant rather than passing the raw string, so only safe, known models are ever instantiated.
    commentable_class = params[:commentable_type].constantize
    # CHANGE 3: Verify the target record actually exists before associating the comment; renders 404 if the id is invalid or refers to a restricted record.
    commentable = commentable_class.find_by(id: params[:commentable_id])
    return render json: { error: "Record not found" }, status: :not_found if commentable.nil?

    @comment = Comment.new(
      body: params[:body],
      user: current_user,
      # CHANGE 2: Assign commentable_type from the validated class name, not raw user input, ensuring only whitelisted strings enter the database.
      commentable_type: commentable_class.name,
      commentable_id: commentable.id
    )

    if @comment.save
      render json: @comment, status: :created
    else
      render json: @comment.errors, status: :unprocessable_entity
    end
  end
end
```

## Explanation

### Issue 1: Unsanitized `commentable_type` from user input

**Problem:** The controller reads `params[:commentable_type]` and writes it straight into the new `Comment` without checking it against `ALLOWED_TYPES`. An attacker can POST `commentable_type=AdminNote` and the application will happily create a comment pointing at `AdminNote` records, leaking their IDs and allowing association with internal data.

**Fix:** An explicit guard clause using `ALLOWED_TYPES.include?(params[:commentable_type])` is added at the top of `create`. If the type is not in the list, the action returns a 422 immediately before any model is touched.

**Explanation:** `ALLOWED_TYPES` was defined in the original code but never actually consulted during the request. Without the check, the whitelist is decoration. The early return means none of the downstream code — `constantize`, `find_by`, or `Comment.new` — ever runs with a bad type. This is important because `constantize` on an arbitrary string can itself raise a `NameError` if the class doesn't exist, which becomes a 500 error that leaks stack information. Rejecting early prevents both the security hole and the server error path.

---

### Issue 2: Raw user string passed to `commentable_type` in `Comment.new`

**Problem:** Even if a whitelist check were added, the original code still passes `params[:commentable_type]` verbatim into `Comment.new`. This means whatever string the client sends — including mixed-case variants like `"article"` or Unicode lookalikes — ends up stored in the `commentable_type` column, potentially causing mismatches when Rails tries to resolve the polymorphic association later.

**Fix:** After the whitelist check passes, `constantize` is called on the validated param to get the actual Ruby class, and then `commentable_class.name` is used as the stored type string. This guarantees the canonical class name (`"Article"`, not `"article"` or `"ARTICLE"`) is always stored.

**Explanation:** Rails resolves polymorphic associations by calling `commentable_type.constantize` when loading a `Comment`. If the stored string doesn't exactly match the class name, the lookup raises a `NameError` at read time even though the record was saved. Using `commentable_class.name` after resolving through a known-good constant means the stored value is always the authoritative Ruby class name. This also future-proofs the code: if a model is renamed via `self.name`, the stored value stays consistent.

---

### Issue 3: No existence check on the target record

**Problem:** The original code accepts any `commentable_id` and saves it without verifying that a record with that ID actually exists in the target table. Sending a valid type like `Article` with a non-existent or out-of-bounds ID creates a dangling comment. If the ID happens to belong to a restricted or soft-deleted record, the comment creation silently succeeds and the ID is now stored in the database.

**Fix:** `find_by(id: params[:commentable_id])` is called on the resolved class after the type is validated. If the result is `nil`, the action returns a 404 before `Comment.new` is called.

**Explanation:** Without this check, an attacker can enumerate IDs by watching whether the save succeeds or fails — the comment saves regardless of whether the target exists. The `find_by` call uses the already-whitelisted `commentable_class`, so there is no additional surface for class injection. Using `find_by` rather than `find` avoids raising `ActiveRecord::RecordNotFound` as an exception and lets the controller return a clean JSON 404 instead of relying on Rails' default exception handler, which may expose more detail in some environments.
