## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Integer Cast Hides Invalid Input
# ------------------------------------------------------------------------

class ProductsController < ApplicationController
  PER_PAGE = 20
  # CHANGE 3: Cap the maximum allowed page number to prevent expensive full-table-scan OFFSETs that can time out the database.
  MAX_PAGE = 1000

  def index
    # CHANGE 1: Replace `.to_i` with an explicit integer-string check so non-numeric input (e.g. "abc") returns a 400 instead of silently becoming 0.
    raw_page = params[:page].presence || "1"
    unless raw_page.match?(/\A\d+\z/)
      return render json: { error: "page must be a positive integer" }, status: :bad_request
    end

    page = raw_page.to_i

    # CHANGE 2: Reject page values less than 1 so negative numbers and zero are treated as invalid input rather than producing a nonsensical or negative OFFSET.
    if page < 1
      return render json: { error: "page must be greater than or equal to 1" }, status: :bad_request
    end

    # CHANGE 3: Reject page values above MAX_PAGE to prevent the database from scanning huge row counts when computing the OFFSET.
    if page > MAX_PAGE
      return render json: { error: "page must not exceed #{MAX_PAGE}" }, status: :bad_request
    end

    offset = (page - 1) * PER_PAGE

    @products = Product.order(:name).limit(PER_PAGE).offset(offset)
    render json: @products
  end
end
```

## Explanation

### Issue 1: Non-numeric input silently accepted

**Problem:** When a client sends `page=abc`, `params[:page].to_i` returns `0` without raising any error. The controller then uses `0 * PER_PAGE = 0` as the offset and returns the first page, giving the caller no indication their input was wrong.

**Fix:** Replace `.to_i` with a regex guard (`/\A\d+\z/`) before conversion. If the string contains anything other than digits, the action immediately returns a `400 Bad Request` with a descriptive message.

**Explanation:** `String#to_i` in Ruby is intentionally lenient — it parses as many leading digits as it can find and returns `0` for strings with none. This is useful in scripts but wrong in a web API where invalid input should be rejected loudly. The regex `\A\d+\z` anchors to the full string, so `"123abc"`, `"abc"`, and `""` all fail. Using `params[:page].presence` first means a missing `page` param defaults to `"1"` rather than triggering the validation error, which is the desired behaviour for optional pagination.

---

### Issue 2: Negative page numbers produce invalid OFFSET

**Problem:** `page=-5` passes through `.to_i` as `-5`, then `offset = -5 * 20 = -100`. Most databases (including PostgreSQL and MySQL) reject a negative OFFSET with an error, so the request crashes with a 500 instead of a clean client error.

**Fix:** After the regex check (which already blocks strings like `"-5"` because `-` is not a digit), add an explicit `if page < 1` guard that returns `400` for zero and any integer below one.

**Explanation:** The regex `\A\d+\z` rejects the literal string `"-5"` because of the leading minus sign, so negative numbers from the query string are already blocked by CHANGE 1. The `page < 1` check is a defence-in-depth safeguard for zero (`"0"` passes the digit regex) and for any future code path that might call this logic with an already-converted integer. An OFFSET of zero is technically valid SQL but means page `0` and page `1` would return the same results, which is a confusing UX bug. Requiring `page >= 1` and computing `offset = (page - 1) * PER_PAGE` makes page 1 correctly return offset 0.

---

### Issue 3: Unbounded page number enables denial-of-service

**Problem:** Sending `page=99999999` makes the database compute `OFFSET 1999999980`. To do this, the query engine must skip past nearly two billion rows, performing a full-table sequential scan even when the table is small. This ties up a database connection and CPU for the duration of the query, and an attacker can issue many such requests in parallel to exhaust the connection pool.

**Fix:** Introduce a `MAX_PAGE` constant (set to `1000`) and return `400` for any page value that exceeds it. The check appears after the type and sign validation so error messages remain specific.

**Explanation:** SQL `OFFSET` is not free — the database must locate and discard the first `N` rows before returning the requested page. Even with an index on `name`, skipping 2 billion rows forces a full index scan or sequential scan. There is no built-in Rails protection against this; the application must enforce its own upper bound. A limit of `1000` pages times 20 per page covers 20 000 products, which is a reasonable upper bound for most catalogues. If your dataset is larger, raise `MAX_PAGE` accordingly, but always set *some* ceiling. Cursor-based pagination is a more scalable alternative for very large tables, but a page cap is a low-effort fix that stops the immediate DoS vector.
