---
slug: context-propagation-background
track: go
orderIndex: 73
title: Request Context Not Propagated
difficulty: easy
tags:
  - context
  - http
  - correctness
language: go
---

## Context

The handler in `api/handlers/search.go` calls a downstream search service and is expected to abort the outgoing HTTP request if the client disconnects. The service handles long-polling search queries that can take several seconds, and keeping idle upstream connections alive wastes downstream resources.

Operators observed that even after clients disconnect (visible as closed connections in access logs), the downstream search service continues processing and the upstream HTTP calls are never cancelled. The per-request CPU and connection usage on the downstream service is far higher than expected.

The team confirmed the client-disconnect detection on the Go server is working — `r.Context()` does get cancelled when the client drops. The bug must be in how the downstream call is constructed.

## Buggy code

```go
package handlers

import (
	"encoding/json"
	"net/http"
)

func SearchHandler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "missing query", http.StatusBadRequest)
		return
	}

	// Call downstream search service
	req, err := http.NewRequest(http.MethodGet, "https://search.internal/query?q="+query, nil)
	if err != nil {
		http.Error(w, "failed to build request", http.StatusInternalServerError)
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "search failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	json.NewEncoder(w).Encode(result)
}
```
