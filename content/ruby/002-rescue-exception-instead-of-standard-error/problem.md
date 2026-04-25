---
slug: rescue-exception-instead-of-standard-error
track: ruby
orderIndex: 2
title: Rescue Catches SignalException
difficulty: easy
tags:
  - idioms
  - error-handling
  - ruby
language: ruby
---

## Context

This retry wrapper lives in `lib/external_api_client.rb` and is used throughout the codebase to call a third-party payment API. The intention is to retry transient network failures up to three times with an exponential back-off before giving up and raising.

DevOps noticed that deploying a new version of the app (which sends `SIGTERM` to the old processes) sometimes takes several minutes — far longer than the 30-second grace period. The processes seem to ignore the termination signal and keep retrying. A `kill -9` is required to end them.

The team ruled out issues with the process supervisor configuration and verified that other parts of the app respond to `SIGTERM` correctly. Only requests that hit the retry loop are affected.

## Buggy code

```ruby
module ExternalApiClient
  MAX_RETRIES = 3

  def self.with_retry(&block)
    attempts = 0
    begin
      attempts += 1
      block.call
    rescue Exception => e
      raise if attempts >= MAX_RETRIES
      sleep(2 ** attempts)
      retry
    end
  end
end
```
