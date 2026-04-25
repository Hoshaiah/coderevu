## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — before_action Only Leaves Gap
# ------------------------------------------------------------------------

class DocumentsController < ApplicationController
  # CHANGE 1: Added :download to the only: list so authenticate_user! runs before that action too.
  before_action :authenticate_user!, only: [:index, :show, :edit, :update, :destroy, :download]

  def index
    @documents = current_user.documents
  end

  def show
    @document = current_user.documents.find(params[:id])
  end

  def public_preview
    @document = Document.published.find(params[:id])
    render :preview
  end

  def download
    # CHANGE 2: Scope the lookup to current_user.documents so users can only download their own files.
    @document = current_user.documents.find(params[:id])
    send_file @document.file_path
  end

  def edit; end
  def update; end
  def destroy; end
end
```

## Explanation

### Issue 1: `download` Missing from Authentication Allow-list

**Problem:** Any unauthenticated visitor can hit the `download` route and receive a 200 response with the file contents. The `before_action :authenticate_user!` guard never runs for `download` because the action name is not present in the `only:` array.

**Fix:** Add `:download` to the `only:` array on the `before_action` line, making it `only: [:index, :show, :edit, :update, :destroy, :download]`.

**Explanation:** Rails `before_action` with `only:` is an allow-list: the callback fires exclusively for the named actions. Every other action in the controller is unguarded by default. When the contractor added `download`, it did not appear in that list, so Rails skipped the authentication callback entirely for that action. The symptom is invisible when reading the action list alone — you have to cross-reference the `before_action` allow-list to notice the gap. The alternative pattern, `skip_before_action :authenticate_user!, only: [:public_preview]`, would have made `download` protected by default and only opted `public_preview` out, which is safer when new actions are added frequently.

---

### Issue 2: Insecure Direct Object Reference in `download`

**Problem:** An authenticated user who knows (or guesses) another user's document ID can download that document. The original code calls `Document.find(params[:id])`, which searches all documents regardless of ownership.

**Fix:** Replace `Document.find(params[:id])` with `current_user.documents.find(params[:id])` so the ActiveRecord query is scoped to the records the current user owns.

**Explanation:** `Document.find` issues `SELECT * FROM documents WHERE id = ?` with no ownership constraint. Any valid document ID returns the record, even if it belongs to a different user. Scoping through `current_user.documents` adds an implicit `AND user_id = ?` condition to the query, so an out-of-scope ID raises `ActiveRecord::RecordNotFound` (which Rails turns into a 404) instead of serving the file. The `show` action in this same controller already uses `current_user.documents.find`, so the secure pattern was present — it just wasn't carried over to `download`. A related pitfall: if you later add pagination or export endpoints, always scope through the association rather than the top-level model class.
