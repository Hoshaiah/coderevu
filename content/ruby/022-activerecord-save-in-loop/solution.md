## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Save Inside Transaction Loop
# ------------------------------------------------------------------------

class BulkTagService
  def initialize(category_id, tag_ids)
    @category_id = category_id
    @tag_ids = tag_ids
  end

  def call
    articles = Article.where(category_id: @category_id)

    # CHANGE 2: Capture the count from the already-scoped relation before the update so we avoid a redundant COUNT query afterward.
    count = articles.count

    Article.transaction do
      # CHANGE 1: Replace the per-row save! loop with a bulk tagging approach — delete existing joins in one DELETE and re-insert in one INSERT, avoiding thousands of individual UPDATE statements.
      # CHANGE 3: Remove the .each that loaded all Article objects into memory; operate directly on IDs instead.
      article_ids = articles.pluck(:id)

      ArticleTag.where(article_id: article_ids).delete_all

      rows = article_ids.flat_map do |article_id|
        @tag_ids.map { |tag_id| { article_id: article_id, tag_id: tag_id } }
      end

      ArticleTag.insert_all(rows) if rows.any?
    end

    { updated: count }
  end
end
```

## Explanation

### Issue 1: Per-row UPDATE loop saturates database

**Problem:** For a category with 8,000 articles, `article.save!` inside `each` fires 8,000 individual `UPDATE articles` statements (plus `DELETE`/`INSERT` for join records). Each round-trip has latency, and the DB CPU spikes to 100% handling thousands of sequential writes. The Heroku 60-second timeout is hit well before the loop finishes.

**Fix:** The `each` loop and `article.save!` are replaced with `ArticleTag.where(article_id: article_ids).delete_all` and `ArticleTag.insert_all(rows)`. These two statements replace thousands of per-row operations with one bulk DELETE and one bulk INSERT.

**Explanation:** Every call to `article.save!` on a model with `has_and_belongs_to_many` or `has_many :through` tags triggers at minimum a `DELETE FROM article_tags WHERE article_id = ?` and one `INSERT` per tag, plus an `UPDATE articles` for `updated_at`. Multiply that by 8,000 and you have ~24,000+ SQL statements in a tight loop. `delete_all` emits a single `DELETE ... WHERE article_id IN (...)` and `insert_all` emits a single `INSERT INTO article_tags (...) VALUES ...` with all rows at once, keeping the database work to two statements regardless of dataset size. One related pitfall: `insert_all` does not run ActiveRecord callbacks or validations on `ArticleTag`, so if you rely on those, you need to add explicit validation logic before inserting.

---

### Issue 2: Redundant COUNT query after transaction

**Problem:** `articles.count` at the end of `call` fires a `SELECT COUNT(*) FROM articles WHERE category_id = ?` after the transaction has already completed. This is an extra database round-trip that provides no new information — the scope hasn't changed.

**Fix:** `count = articles.count` is moved to before the transaction block, capturing the count from the same relation scope before any writes occur, and the final `{ updated: articles.count }` is replaced with `{ updated: count }`.

**Explanation:** The `articles` relation is a lazy ActiveRecord scope. Calling `.count` on it twice hits the database twice. Because the `WHERE category_id = ?` predicate doesn't change between the two calls, the second count always returns the same value as the first. Capturing it once before the transaction avoids the redundant query. This matters less for correctness than for efficiency, but on large datasets and under load every saved round-trip helps. If you wanted the count of articles that actually had tags changed (e.g., to handle partial failures), you would track that inside the loop — but for this all-or-nothing transaction the pre-count is accurate.

---

### Issue 3: Materializing thousands of ActiveRecord objects into memory

**Problem:** `Article.where(category_id: @category_id).each` loads every matching `Article` row into a Ruby `Article` instance. For 8,000 articles this creates 8,000 objects in the Ruby heap, each carrying all column data, inflating memory and adding garbage-collection pressure on top of the database bottleneck.

**Fix:** The `articles.each` block is replaced with `articles.pluck(:id)`, which fetches only the `id` column into a plain Ruby array of integers. The rest of the logic operates on those IDs directly without instantiating `Article` objects.

**Explanation:** `pluck` runs `SELECT id FROM articles WHERE category_id = ?` and returns `[1, 2, 3, ...]` — no model objects are allocated. Contrast with `each`, which runs `SELECT * FROM articles WHERE category_id = ?` and wraps every row in an `Article` instance complete with attribute hashes, dirty-tracking state, and association caches. For 8,000 rows that means 8,000 objects queued for GC. `pluck` reduces memory from potentially hundreds of megabytes to a small integer array. A related pitfall: if the set of IDs is extremely large (hundreds of thousands), you would want to chunk `pluck` results with `in_batches` to avoid building one enormous `IN (...)` clause — but for the stated 10,000-article limit a single `pluck` is fine.
