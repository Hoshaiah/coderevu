---
slug: double-close-response-body
track: go
orderIndex: 53
title: Response Body Closed Twice
difficulty: medium
tags:
  - errors
  - resource-management
  - http
language: go
---

## Context

This function lives in `client/api.go`, an HTTP client wrapper used by several services. It fetches a JSON payload from a remote API, decodes it, and returns the parsed struct. The caller receives the result and never touches the response body directly.

In production, the service logs intermittent panics: `close of already-closed body` (the exact message varies by Go version and transport). They appear only under high concurrency and are non-deterministic, making them hard to reproduce in staging. Request traces show the panic happens during or after the JSON decode.

A previous reviewer added the explicit `resp.Body.Close()` after the `defer` as a premature optimisation to release the connection back to the pool sooner. The panic started appearing shortly after that change was deployed.

## Buggy code

```go
package client

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type APIResponse struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

func FetchUser(url string) (*APIResponse, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var result APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	resp.Body.Close()
	return &result, nil
}
```
