---
slug: hash-comparison-timing-attack
track: python
orderIndex: 86
title: Non-Constant Time Token Comparison
difficulty: hard
tags:
  - correctness
  - security
  - authentication
language: python
---

## Context

This middleware lives in `auth/webhook_validator.py` and validates incoming webhook requests from a payment provider. The provider signs each request with an HMAC-SHA256 signature transmitted in the `X-Webhook-Signature` header. The validator recomputes the HMAC over the raw request body and compares the result with the header value before allowing the request to proceed.

A security audit flags this component as vulnerable to timing side-channel attacks. The auditor's report notes that an attacker who can make many requests and observe response latency can, byte-by-byte, reconstruct a valid HMAC signature without knowing the secret key. The function otherwise looks correct — the right algorithm and key are used.

## Buggy code

```python
import hashlib
import hmac

WEBHOOK_SECRET = b"super-secret-key"

def validate_webhook(
    body: bytes,
    signature_header: str,
) -> bool:
    expected = hmac.new(
        WEBHOOK_SECRET,
        body,
        hashlib.sha256,
    ).hexdigest()
    return expected == signature_header
```
