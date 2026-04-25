## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Timeout Kills Mid-Transaction Safely
# ------------------------------------------------------------------------

# CHANGE 3: Fixed corrupted require line — two separate require calls as they must be.
require "timeout"
require "net/http"

class PaymentClient
  GATEWAY_TIMEOUT = 10

  def self.charge(user:, amount_cents:)
    # CHANGE 1: Removed Timeout::timeout wrapper entirely — Ruby's Timeout raises asynchronously and can interrupt C-extension DB code mid-flight, corrupting the connection and leaking it from the pool. Use Net::HTTP's own read_timeout instead (see below).
    # CHANGE 2: Moved the HTTP call OUTSIDE the transaction so a gateway success followed by a slow response cannot leave the DB and gateway out of sync inside a single atomic block.
    response = nil

    uri = URI("https://gateway.example.com/charge")
    # CHANGE 1: Set read_timeout and open_timeout on the Net::HTTP object so the socket itself enforces the deadline safely, without Timeout::timeout.
    Net::HTTP.start(uri.host, uri.port, use_ssl: true,
                    open_timeout: GATEWAY_TIMEOUT,
                    read_timeout: GATEWAY_TIMEOUT) do |http|
      response = http.post(
        uri.path.empty? ? "/" : uri.path,
        { amount: amount_cents, token: user.payment_token }.to_json,
        "Content-Type" => "application/json"
      )
    end

    gateway_ref = JSON.parse(response.body)["ref"]

    # CHANGE 2: Transaction now contains only local DB work, so a timeout or network error on the HTTP side cannot leave a dangling open transaction or a corrupted connection.
    ActiveRecord::Base.transaction do
      payment = Payment.create!(user: user, amount_cents: amount_cents, status: :completed, gateway_ref: gateway_ref)
      payment
    end
  rescue Net::OpenTimeout, Net::ReadTimeout
    # CHANGE 1: Rescue the socket-level timeout errors raised by Net::HTTP instead of Timeout::Error.
    Rails.logger.error("Payment gateway timed out for user #{user.id}")
    false
  end
end
```

## Explanation

### Issue 1: `Timeout::timeout` corrupts DB connections

**Problem:** Under load, the team sees database connection pool exhaustion errors. Occasionally a connection is checked out but never returned, and queries on that connection fail with unexpected state errors because the transaction was never closed.

**Fix:** Remove `Timeout::timeout` entirely. Replace it with `Net::HTTP.start` configured with `open_timeout:` and `read_timeout:` keyword arguments, and rescue `Net::OpenTimeout` / `Net::ReadTimeout` instead of `Timeout::Error`.

**Explanation:** Ruby's `Timeout::timeout` works by raising `Timeout::Error` in the target thread from a separate timer thread. The raise can land at any Ruby instruction, including inside C-extension code used by database adapters. When it fires inside a `pg` or `mysql2` call, the adapter's internal state machine is interrupted mid-operation and the connection is left in an unknown state. ActiveRecord marks the connection as still checked out, so it is never returned to the pool. Over time the pool exhausts. `Net::HTTP`'s own timeout options operate at the socket level — they let the OS signal the blocked `read(2)` syscall, which unwinds cleanly through the C extension and raises a pure-Ruby exception only after the stack is in a safe place.

---

### Issue 2: HTTP call inside transaction creates split-charge risk

**Problem:** Operators see payments charged on the gateway side but the local `Payment` record is either missing or stuck at `:pending`. This happens when the HTTP request succeeds but anything (timeout, network hiccup, DB error) occurs before the transaction commits.

**Fix:** Move the `Net::HTTP` call before and outside the `ActiveRecord::Base.transaction` block. Only the local database writes (`Payment.create!`) stay inside the transaction. The `gateway_ref` returned by the gateway is captured in a local variable and passed into the `create!` call.

**Explanation:** A database transaction provides atomicity only for the operations it encloses. When an HTTP call to an external system sits inside a transaction, the two systems cannot be rolled back together — the gateway has no way to undo a charge because your local transaction rolled back. By performing the HTTP call first and storing the result, the local DB write becomes a single fast operation. If that DB write fails you still have a problem (the charge happened but was not recorded), but that surface area is much smaller and can be handled with idempotency keys or a retry on the DB side. Keeping HTTP calls inside transactions also holds DB connections open for the full network round-trip, which adds to pool pressure under concurrency.

---

### Issue 3: Syntax error on `require` lines

**Problem:** The file fails to load entirely — Ruby raises a `SyntaxError` or `LoadError` at boot time, so every job that tries to use `PaymentClient` crashes immediately.

**Fix:** Split `require "timeout"equire "net/http"` into two separate lines: `require "timeout"` and `require "net/http"`.

**Explanation:** The original line is `require "timeout"equire "net/http"` — the two `require` calls were accidentally merged into one string literal `"timeout"equire "net/http"` with a bare `equire` identifier after it, which is a syntax error. Ruby cannot parse the file at all, so the class is never defined. The fix is to restore the two independent `require` calls on separate lines.
