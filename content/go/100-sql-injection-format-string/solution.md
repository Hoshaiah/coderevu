## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — User-supplied input interpolated directly into SQL query
// ------------------------------------------------------------------------
package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

type Product struct {
	ID   int
	Name string
}

func SearchProducts(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		term := r.URL.Query().Get("q")
		// CHANGE 1: Use a parameterized query with a placeholder instead of fmt.Sprintf string interpolation. The driver binds `term` safely, preventing SQL injection.
		query := "SELECT id, name FROM products WHERE name ILIKE '%' || $1 || '%'"
		rows, err := db.QueryContext(r.Context(), query, term)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		var products []Product
		for rows.Next() {
			var p Product
			// CHANGE 2: Check the error returned by rows.Scan and abort the request if scanning fails, rather than silently continuing with a zero-value struct.
			if err := rows.Scan(&p.ID, &p.Name); err != nil {
				http.Error(w, "scan failed", http.StatusInternalServerError)
				return
			}
			products = append(products, p)
		}
		json.NewEncoder(w).Encode(products)
	}
}
```

## Explanation

### Issue 1: SQL injection via string interpolation

**Problem:** The handler builds the SQL query with `fmt.Sprintf`, embedding the raw value of the `q` query parameter directly into the string. Sending `' OR '1'='1` as the search term closes the string literal and appends a condition that matches every row. A more destructive payload like `'; DROP TABLE products; --` executes arbitrary DDL against the database.

**Fix:** Remove the `fmt` import and replace `fmt.Sprintf("...%s...", term)` with a static query string `"SELECT id, name FROM products WHERE name ILIKE '%' || $1 || '%'"` that uses the PostgreSQL `$1` placeholder. Pass `term` as a separate argument to `db.QueryContext` so the driver handles quoting and escaping.

**Explanation:** When the query is built as a string, the database parser sees the user's text as SQL syntax, not as a data value. Parameterized queries separate the query structure from the data: the driver sends them to the database in distinct protocol messages (or escapes them safely), so the value of `$1` can never change the query's parse tree. The ILIKE pattern is constructed with string concatenation operators inside SQL (`'%' || $1 || '%'`) so the wildcard characters are part of the static query and the user-supplied term is still bound safely as a plain value. One related pitfall: using `fmt.Sprintf` to build the static part of a query and a placeholder for user input is fine, but any user-controlled value must always go through a placeholder, never inline.

---

### Issue 2: Ignored error from rows.Scan

**Problem:** `rows.Scan(&p.ID, &p.Name)` can fail — for example if a column value cannot be converted to the target Go type, or if the result set schema changes — but the return value is discarded with a bare statement. When that happens, `p` retains its zero values (`0` and `""`), and the handler silently encodes a corrupt product into the response.

**Fix:** Replace the bare `rows.Scan(...)` call with `if err := rows.Scan(&p.ID, &p.Name); err != nil { http.Error(...); return }`. This checks the returned `error` on every iteration and terminates the request with a 500 if scanning fails.

**Explanation:** `database/sql` functions consistently return errors rather than panicking, so ignoring them means the program proceeds as if the operation succeeded. A scan failure mid-loop means some products in the response have empty names and zero IDs, which is incorrect data delivered to the client with a 200 status. Checking the error and returning early ensures the client either gets a complete, correct list or a clear error response. A related concern is also checking `rows.Err()` after the loop, which surfaces errors that occur during iteration at the driver level; adding that check after `rows.Close()` would make error handling fully complete.
