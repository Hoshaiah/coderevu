---
slug: once-do-error-ignored
track: go
orderIndex: 67
title: sync.Once Swallows Init Error
difficulty: hard
tags:
  - errors
  - goroutines
  - concurrency
language: go
---

## Context

This code is in `pkg/config/loader.go`. A `sync.Once` is used to load and parse a configuration file exactly once, even under concurrent access. The loaded config is stored in a package-level variable. Subsequent callers reuse the cached result.

In production, when the config file is missing or malformed, some requests succeed (returning a zero-value config) and others fail — behaviour is non-deterministic. Adding error logging to `loadConfig` confirms the error is being encountered, but callers never receive it. After a bad deploy with a broken config file, the service came up silently misconfigured instead of refusing to start.

The developer chose `sync.Once` specifically to avoid a mutex around the file read. They are aware that `sync.Once` does not retry on failure and considered that acceptable, but expected errors to propagate to callers.

## Buggy code

```go
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

type Config struct {
	DSN      string `json:"dsn"`
	LogLevel string `json:"log_level"`
}

var (
	once   sync.Once
	global Config
)

func Get() Config {
	once.Do(func() {
		if err := loadConfig(); err != nil {
			fmt.Fprintf(os.Stderr, "config load error: %v\n", err)
		}
	})
	return global
}

func loadConfig() error {
	f, err := os.Open("config.json")
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewDecoder(f).Decode(&global)
}
```
