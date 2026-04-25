---
slug: frozen-constant-array-push
track: ruby
orderIndex: 14
title: Mutation of Frozen Constant Array
difficulty: easy
tags:
  - mutability
  - ruby
  - constants
language: ruby
---

## Context

This code lives in `lib/config/allowed_roles.rb`, a small module loaded at boot time by a Rails initializer. It defines a constant that other parts of the application read to gate access to certain admin features.

In production, the app intermittently raises `FrozenError: can't modify frozen Array` during request handling, but only on certain dynos and only after the app has been running for a while. The stack trace points deep into middleware, making it hard to pinpoint the actual writer.

The team added `frozen_string_literal: true` to the file recently as part of a performance sweep and assumed that covered everything. They have not yet connected that change to the errors appearing in the role-check path.

## Buggy code

```ruby
# frozen_string_literal: true

module Config
  ALLOWED_ROLES = ["admin", "editor", "viewer"].freeze

  def self.grant_temporary_role(role)
    ALLOWED_ROLES << role
  end

  def self.allowed?(role)
    ALLOWED_ROLES.include?(role)
  end
end

# Called during an OAuth callback when a partner SSO grants extra roles:
Config.grant_temporary_role("partner_read")
```
