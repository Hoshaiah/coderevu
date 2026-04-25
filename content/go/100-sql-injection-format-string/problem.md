---
slug: sql-injection-format-string
track: go
orderIndex: 100
title: User-supplied input interpolated directly into SQL query
difficulty: easy
tags:
  - security
  - sql-injection
  - database
  - input-validation
language: go
---

## Context

This handler backs a product search endpoint in an e-commerce API. The search term comes directly from the query string. During a security audit the team discovered that supplying `' OR '1'='1` as a search term returns every row in the products table, and a more malicious payload can drop tables entirely.

## Buggy code

```go
package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
)

type Product struct {
	ID   int
	Name string
}

func SearchProducts(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		term := r.URL.Query().Get("q")
		query := fmt.Sprintf(
			"SELECT id, name FROM products WHERE name ILIKE '%%%s%%'", term)
		rows, err := db.QueryContext(r.Context(), query)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		var products []Product
		for rows.Next() {
			var p Product
			rows.Scan(&p.ID, &p.Name)
			products = append(products, p)
		}
		json.NewEncoder(w).Encode(products)
	}
}
```
