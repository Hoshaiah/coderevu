## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — sync.Once Swallows Init Error
// ------------------------------------------------------------------------

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
	once      sync.Once
	global    Config
	// CHANGE 2: added a package-level error variable so the load outcome is stored and reusable by all callers.
	globalErr error
)

// CHANGE 1: Get now returns (Config, error) so callers receive the load error instead of silently getting a zero-value Config.
func Get() (Config, error) {
	once.Do(func() {
		// CHANGE 2: capture the error into globalErr so every caller after the first can also read it.
		globalErr = loadConfig()
		if globalErr != nil {
			fmt.Fprintf(os.Stderr, "config load error: %v\n", globalErr)
		}
	})
	// CHANGE 1: return globalErr alongside the config so callers can act on a failed load.
	return global, globalErr
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

## Explanation

### Issue 1: Error never returned to callers

**Problem:** `Get()` returns only a `Config` value. When `loadConfig()` returns an error, the error is printed to stderr and then discarded. Every caller receives a zero-value `Config` (empty `DSN`, empty `LogLevel`) and has no way to know the load failed. The service starts in a silently misconfigured state.

**Fix:** Change `Get()` to return `(Config, error)`. At the `return` statement, return `global, globalErr` instead of just `global`. All call sites are now forced by the compiler to handle or explicitly ignore the error.

**Explanation:** `sync.Once` runs the closure once and stores nothing about its outcome — it only guarantees the closure ran. The original code captured the error inside the closure, logged it, and let it go out of scope. Callers after the first got `global` whether it was populated or zero-valued. Returning the error from `Get()` means callers can check it, and early startup code (e.g., `main`) can call `log.Fatal` to refuse to start. One pitfall: because `sync.Once` does not retry, a transient file-open error on the first call permanently poisons `globalErr` for all future calls — this is the accepted trade-off the developer already acknowledged.

---

### Issue 2: Load error not persisted for subsequent callers

**Problem:** Even if `Get()` were changed to return an error, there is no place to store it between the `once.Do` closure and the return statement. The error from `loadConfig()` exists only inside the anonymous function's scope.

**Fix:** Add a package-level variable `globalErr error`. Inside the `once.Do` closure, assign `globalErr = loadConfig()` instead of a local `err := loadConfig()`. The `return` statement in `Get()` then reads `globalErr`, which is safe to read outside the closure because `sync.Once` guarantees all writes inside the closure happen-before `once.Do` returns.

**Explanation:** Go's memory model guarantees that `once.Do` synchronises the closure's writes with the caller's subsequent reads — so reading `globalErr` after `once.Do` returns is data-race-free. Without a package-level variable to hold the result, there is no safe channel to carry the error out of the closure. A local variable inside `Get()` is not usable here because the closure captures by reference but `once.Do` may execute on a different goroutine's first call, making ordering unclear without the `sync.Once` happens-before guarantee. Storing both `global` and `globalErr` at package level keeps the pattern symmetric and easy to reason about.
