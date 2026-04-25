---
slug: cache-fetch-memoize-nil
track: ruby
orderIndex: 9
title: Cache Fetch Ignores Nil Result
difficulty: medium
tags:
  - idioms
  - active-record
  - correctness
language: ruby
---

## Context

This code lives in `app/models/feature_flag.rb`. The system stores feature flags in the database and caches them in Redis via `Rails.cache` to avoid hitting the DB on every request. The cache key includes the flag name and expires after 5 minutes.

Users started reporting that after an admin disables a feature flag, the flag stays active for some users indefinitely — even well past the 5-minute TTL. Restarting the app fixes it temporarily, but the problem returns.

The team added logging and confirmed `Rails.cache.delete` is being called correctly on every write. They also verified the Redis key disappears after the delete. The issue only manifests when a flag is explicitly set to `nil` or deleted from the database, not when it's set to `false`.

## Buggy code

```ruby
class FeatureFlag < ApplicationRecord
  CACHE_TTL = 5.minutes

  def self.enabled?(name)
    @flag_cache ||= {}
    return @flag_cache[name] if @flag_cache.key?(name)

    value = Rails.cache.fetch("feature_flag:#{name}", expires_in: CACHE_TTL) do
      record = find_by(name: name)
      record&.enabled
    end

    @flag_cache[name] = value
    value
  end

  def self.bust_cache!(name)
    @flag_cache&.delete(name)
    Rails.cache.delete("feature_flag:#{name}")
  end
end
```
