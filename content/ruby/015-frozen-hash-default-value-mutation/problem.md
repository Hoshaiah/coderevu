---
slug: frozen-hash-default-value-mutation
track: ruby
orderIndex: 15
title: Frozen Config Hash Mutated
difficulty: easy
tags:
  - mutability
  - ruby
  - frozen
language: ruby
---

## Context

In `lib/config/defaults.rb`, a small helper returns a frozen hash of default HTTP client options that various service objects merge with per-request overrides before calling `Net::HTTP`.

A developer started seeing `FrozenError: can't modify frozen Hash` in production after a routine refactor. The error appears on the first request after boot when the `timeout` key needs to be set dynamically from an environment variable.

The frozen constant was introduced three sprints ago specifically to prevent accidental mutation, but the call site was written as if the returned hash were mutable.

## Buggy code

```ruby
# lib/config/defaults.rb
module Config
  HTTP_DEFAULTS = {
    open_timeout: 5,
    read_timeout: 10,
    verify_ssl: true
  }.freeze

  def self.http_options
    HTTP_DEFAULTS
  end
end

# lib/services/payment_client.rb
class PaymentClient
  def initialize
    @options = Config.http_options
    @options[:read_timeout] = Integer(ENV.fetch("PAYMENT_TIMEOUT", 15))
  end

  def post(path, body)
    # ... uses @options
  end
end
```
