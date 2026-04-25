## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Deleting a resource sometimes raises AbstractController::DoubleRenderError in production
# ------------------------------------------------------------------------
# app/controllers/documents_controller.rb
class DocumentsController < ApplicationController
  before_action :set_document

  def destroy
    if @document.destroy
      flash[:notice] = "Document deleted successfully."
    else
      flash[:alert] = "Could not delete document."
    end
    # CHANGE 2: add explicit return so no code after this line executes, preventing any chance of a double render/redirect if callbacks or future code paths also call render or redirect.
    return redirect_to documents_path
  end

  private

  def set_document
    # CHANGE 1: use find_by instead of find so that a missing record (e.g. the document was already deleted by a prior request) returns nil rather than raising ActiveRecord::RecordNotFound, then redirect gracefully.
    @document = Document.find_by(id: params[:id])
    unless @document
      flash[:alert] = "Document not found."
      redirect_to documents_path
    end
  end
end
```

## Explanation

### Issue 1: Missing record raises unhandled 500

**Problem:** When a user double-clicks the delete button, the first request deletes the document. The second request hits `set_document`, which calls `Document.find(params[:id])`. Because the record no longer exists, ActiveRecord raises `ActiveRecord::RecordNotFound`, and Rails returns a 500 (or 404 depending on config) instead of redirecting the user somewhere sensible.

**Fix:** Replace `Document.find(params[:id])` with `Document.find_by(id: params[:id])` and add a guard that redirects to `documents_path` with a flash message when `@document` is `nil`.

**Explanation:** `find` raises an exception when no row matches; `find_by` returns `nil`. By checking for `nil` immediately in the `before_action` and issuing a redirect, the action never runs for a non-existent document. Rails halts the filter chain when `redirect_to` is called inside a `before_action`, so `destroy` itself is never reached. This pattern also protects against race conditions in concurrent environments where two separate users or tabs try to delete the same record at the same time.

---

### Issue 2: Missing return allows double render/redirect

**Problem:** Rails raises `AbstractController::DoubleRenderError` when more than one render or redirect is issued in a single action. If any `after_action` callback, a monkey-patched middleware, or future code added below `redirect_to` also calls `redirect_to` or `render`, the exception fires. Sentry shows this happening intermittently in production, which points to a timing or callback interaction rather than purely the double-click.

**Fix:** Change the last line of `destroy` from `redirect_to documents_path` to `return redirect_to documents_path`, so the method exits immediately after the redirect is registered.

**Explanation:** `redirect_to` does not stop Ruby execution; it sets headers and marks the response, but the method continues running. Any code or callback that issues another `redirect_to` or `render` after the first one triggers `AbstractController::DoubleRenderError`. Adding `return` causes the method to exit as soon as the redirect is queued, making it impossible for subsequent lines or callbacks in the same request cycle to issue a second response. This is a low-cost defensive practice worth applying to every action that ends with a redirect or render, especially in controllers that have active `after_action` hooks.
