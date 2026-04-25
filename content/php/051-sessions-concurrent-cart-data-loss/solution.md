## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Concurrent Writes Corrupt Session Cart
// ------------------------------------------------------------------------

<?php
// src/Cart/CartService.php

class CartService
{
    // CHANGE 1: Extracted a private helper that calls session_start() only when no session is active, ensuring PHP's file-based session lock is acquired exactly once and not re-acquired on a second call in the same request.
    private function ensureSession(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }

    public function addItem(int $productId, int $qty): void
    {
        // CHANGE 1: Replace bare session_start() with ensureSession() so a running session is reused and the file lock is not released and re-acquired between calls, which would open a race window.
        $this->ensureSession();

        $cart = $_SESSION['cart'] ?? [];
        $cart[$productId] = ($cart[$productId] ?? 0) + $qty;
        $_SESSION['cart'] = $cart;

        session_write_close();
    }

    public function getCart(): array
    {
        // CHANGE 1: Same guard — avoids re-starting a session that is already open.
        $this->ensureSession();
        $cart = $_SESSION['cart'] ?? [];
        session_write_close();
        return $cart;
    }

    public function removeItem(int $productId): void
    {
        // CHANGE 1: Same guard here too for consistency across all methods.
        $this->ensureSession();
        $cart = $_SESSION['cart'] ?? [];
        unset($cart[$productId]);
        $_SESSION['cart'] = $cart;
        session_write_close();
    }
}
```

## Explanation

### Issue 1: No Session Locking Causes Last-Writer-Wins Race

**Problem:** When three 'Add to Cart' AJAX requests arrive at the same time, all three call `session_start()` and each reads the same cart from the session file before any of them has written back. Each request then writes its own updated cart, overwriting the others. The customer ends up with only the last item that was written, not all three.

**Fix:** Replace every bare `session_start()` call with the new `ensureSession()` helper, which checks `session_status() === PHP_SESSION_NONE` before calling `session_start()`. This means the session file lock is held from the first `session_start()` call until `session_write_close()` is called, serialising concurrent requests through PHP's built-in file lock.

**Explanation:** PHP's file-based session handler uses `flock()` on the session file. When `session_start()` is called, PHP acquires an exclusive write lock; when `session_write_close()` is called, it releases the lock. While one request holds the lock, all other requests block inside their own `session_start()` call until the lock is freed. This means the second request does not read the session file until the first has written its updated cart back, so the second request sees the already-updated cart and adds its item on top — producing the correct cumulative result. Without the lock (or if the lock is released prematurely by calling `session_write_close()` too early), requests interleave freely. A related pitfall: if you switch to a session handler that does not lock (some Redis or Memcached adapters), this same race can reappear even with `session_start()` used correctly, and you would need explicit locking at the application layer instead.

---

### Issue 2: Calling `session_start()` on an Already-Active Session

**Problem:** If any code in the same PHP request calls `session_start()` before reaching `CartService` (a common situation with frameworks, middleware, or test harnesses), calling `session_start()` a second time emits an `E_NOTICE` ('A session had already been started') and, depending on the PHP version and error handler, can leave the session state inconsistent or cause test failures.

**Fix:** The `ensureSession()` helper added at CHANGE 1 wraps `session_start()` in a `session_status() === PHP_SESSION_NONE` guard, so `session_start()` is only called when no session is currently running.

**Explanation:** `session_status()` returns one of three constants: `PHP_SESSION_DISABLED`, `PHP_SESSION_NONE`, or `PHP_SESSION_ACTIVE`. Checking for `PHP_SESSION_NONE` before calling `session_start()` means the method is safe to call whether or not a session is already open. If the session is already active the method does nothing, the existing `$_SESSION` data is available, and no warning is raised. This also means `session_write_close()` at the end of each method will close a session that `CartService` itself opened, but if the caller opened the session, closing it here could surprise the caller — a further improvement would be to track whether this instance opened the session and only close it in that case, but that is outside the minimal scope of this fix.
