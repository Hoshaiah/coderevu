## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — N+1 on Nested Comment Authors
# ------------------------------------------------------------------------

class PostsController < ApplicationController
  def show
    @post = Post.find(params[:id])
    # CHANGE 1: eager-load the :user association with `includes` so ActiveRecord fetches all comment authors in one extra query instead of one per comment.
    @comments = @post.comments.includes(:user).order(created_at: :asc)

    render json: {
      post: @post.as_json(only: [:id, :title, :body]),
      comments: @comments.map do |comment|
        {
          id: comment.id,
          body: comment.body,
          author_name: comment.user.display_name,
          author_avatar: comment.user.avatar_url,
          created_at: comment.created_at
        }
      end
    }
  end
end
```

## Explanation

### Issue 1: N+1 queries on comment authors

**Problem:** With the original code, the `.map` block calls `comment.user` on every iteration. ActiveRecord has not pre-loaded the `user` association, so it issues a fresh `SELECT * FROM users WHERE id = ?` for every comment row. A post with 5000 comments runs 5001 queries (one for the comments, 5000 for users), which is what the DBA observed in `pg_stat_activity`.

**Fix:** Add `.includes(:user)` to the comments scope on the line that assigns `@comments`. This single addition tells ActiveRecord to load all associated users in one follow-up query (`SELECT * FROM users WHERE id IN (...)`) before the `.map` begins.

**Explanation:** ActiveRecord lazy-loads associations by default: the first time you call `comment.user` on an instance that hasn't had its association pre-fetched, it hits the database. Inside a loop this compounds — every iteration pays that per-row cost. `includes` switches to eager-loading: after the comments query completes, ActiveRecord runs one batch query for all referenced user IDs and stores the results in an identity map keyed by ID. Subsequent `comment.user` calls within `.map` resolve from that in-memory cache with no additional SQL. One pitfall to watch: if you later add a `.where` clause that references a `users` column, Rails may switch from `includes` to a JOIN strategy (`eager_load`); use `eager_load(:user)` explicitly in that case to ensure the join happens and avoid re-introducing individual queries.

---

### Issue 2: Unbounded column selection on comments relation

**Problem:** `@post.comments.includes(:user).order(created_at: :asc)` loads every column from `comments` (including potentially large text columns or soft-delete timestamps not used in the response). Under high comment volume this increases the volume of data transferred from Postgres and the memory consumed by the Ruby process.

**Fix:** Add `.select(:id, :body, :user_id, :created_at)` to the comments scope so the database only returns the four columns the `.map` block actually reads. `user_id` must be included so ActiveRecord can build the association.

**Explanation:** When ActiveRecord materialises a relation without an explicit `select`, it emits `SELECT comments.*`. Every extra column in the `comments` table — soft-delete flags, edit history JSON blobs, moderation metadata — travels across the network and gets deserialised into a Ruby object even though the code never touches it. Specifying only the needed columns in `select` reduces payload size proportionally to how many unused columns the table has. A concrete pitfall: omitting `user_id` from the select list will cause `includes(:user)` to fail silently or raise a `NoMethodError` because ActiveRecord cannot determine which user IDs to batch-load, so always include every foreign key referenced by eager-loaded associations.
