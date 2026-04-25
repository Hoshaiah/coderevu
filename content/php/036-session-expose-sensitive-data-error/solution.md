## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Sensitive Session Data in Error Log
// ------------------------------------------------------------------------

<?php
// src/Checkout/PaymentProcessor.php

class PaymentProcessor
{
    private GatewayClient $gateway;

    public function __construct(GatewayClient $gateway)
    {
        $this->gateway = $gateway;
    }

    // CHANGE 3: Centralise redaction so every log site benefits and new fields added to $paymentData are handled here.
    private function redactPaymentData(array $paymentData): array
    {
        $redacted = $paymentData;
        if (isset($redacted['card_number'])) {
            // CHANGE 1: Replace card number with a masked version showing only the last four digits instead of the full PAN.
            $redacted['card_number'] = '****-****-****-' . substr((string)$redacted['card_number'], -4);
        }
        if (isset($redacted['cvv'])) {
            // CHANGE 1: Fully suppress the CVV — it must never appear in any log under PCI DSS rules.
            $redacted['cvv'] = '***';
        }
        return $redacted;
    }

    public function charge(array $paymentData): array
    {
        try {
            $response = $this->gateway->authorize($paymentData);
            return ['success' => true, 'transaction_id' => $response['id']];
        } catch (\Exception $e) {
            // CHANGE 2: Log only the exception class name and a static label rather than $e->getMessage(), which may echo back card data received by the gateway.
            $safeMessage = get_class($e) . ': gateway authorization failed';
            // CHANGE 1: Pass $paymentData through redactPaymentData() so the log contains masked card info, never the raw PAN or CVV.
            error_log(
                '[PaymentProcessor] Gateway error: ' . $safeMessage .
                ' | Context: ' . json_encode($this->redactPaymentData($paymentData))
            );
            return ['success' => false, 'error' => 'Payment failed'];
        }
    }
}
```

## Explanation

### Issue 1: Raw PAN and CVV written to error log

**Problem:** Every time `$this->gateway->authorize()` throws, `json_encode($paymentData)` dumps the full `card_number` and `cvv` fields verbatim into the error log. Because the log aggregator has no field-level encryption and is readable by all engineering staff, real card numbers from live customers appear in plain text dozens of times per day.

**Fix:** A new private method `redactPaymentData()` is introduced. It replaces `card_number` with a masked string keeping only the last four digits (`****-****-****-XXXX`) and replaces `cvv` with `***`. The `catch` block now calls `json_encode($this->redactPaymentData($paymentData))` instead of `json_encode($paymentData)`.

**Explanation:** PCI DSS prohibits storing or logging full PANs after authorization, and forbids logging CVVs entirely. The original code treated the exception handler as a safe debugging context, but log destinations are a form of persistent storage subject to the same rules as databases. Masking the card number to the last four digits preserves enough context to correlate a transaction in support tickets without exposing actionable data. The CVV is fully replaced because there is no legitimate reason to retain it after the authorization attempt ends — even a masked CVV leaks length information.

---

### Issue 2: Gateway exception message may re-echo sensitive request data

**Problem:** `$e->getMessage()` is logged directly. Some payment gateways include a reflection of the request body in their error messages (e.g., "Invalid CVV '123' for card 4111..."). This means the card data can appear in the log even if `$paymentData` is scrubbed.

**Fix:** The `catch` block replaces `$e->getMessage()` with a constructed string `get_class($e) . ': gateway authorization failed'`. This records which exception type was raised (useful for alerting and triage) without forwarding any string the gateway may have embedded.

**Explanation:** The content of exception messages from third-party libraries is outside your control — the gateway vendor may change what they include at any time. Logging the exception class name gives on-call engineers enough signal to know whether the failure was a network timeout, an HTTP 4xx, or a validation rejection, without trusting the message body to be safe. If the full message is needed for a specific incident, it can be retrieved by correlating a transaction ID against gateway-side logs using proper access controls.

---

### Issue 3: No centralised redaction means future fields leak silently

**Problem:** If a developer adds a new sensitive field to `$paymentData` (e.g., `bank_account`, `ssn_last4`) without updating the log call, that field will immediately appear in plain text in the log. There is no single place to audit or enforce what gets scrubbed.

**Fix:** The private `redactPaymentData()` method acts as a single redaction gateway. Any field that must be masked is handled there, so code review and security audits have one clear location to inspect rather than hunting for every `error_log` call that touches payment data.

**Explanation:** Inline scrubbing scattered across multiple catch blocks creates a maintenance hazard: each new log statement requires the developer to remember which fields are sensitive and to apply the same masking logic consistently. A dedicated method makes the policy explicit and testable — you can write a unit test that asserts `redactPaymentData()` never returns a `cvv` field with a real value, and that test will catch regressions immediately. The pattern also makes it straightforward to extend redaction to additional fields (e.g., `routing_number`) in one place.
