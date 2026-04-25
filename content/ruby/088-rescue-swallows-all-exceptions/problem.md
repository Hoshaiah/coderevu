---
slug: rescue-swallows-all-exceptions
track: ruby
orderIndex: 88
title: Database errors silently vanish and return nil to callers
difficulty: easy
tags:
  - error-handling
  - rescue
  - exceptions
language: ruby
---

## Context

This helper is used throughout a Rails app to fetch user records by ID. Several engineers have reported that certain pages render blank instead of showing an error, and no exceptions appear in Sentry. The method was written quickly during a hackathon and never revisited.

## Buggy code

```ruby
class UserRepository
  def self.find(id)
    User.find(id)
  rescue
    nil
  end
end

# Caller:
user = UserRepository.find(params[:id])
profile = user.profile  # NoMethodError: undefined method 'profile' for nil
```
